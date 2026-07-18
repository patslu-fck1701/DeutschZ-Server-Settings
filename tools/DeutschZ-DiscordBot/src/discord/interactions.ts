import {
  ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, ChannelType, ChatInputCommandInteraction,
  EmbedBuilder, GuildMember, MessageFlags, ModalBuilder, ModalSubmitInteraction, PermissionFlagsBits,
  StringSelectMenuInteraction, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { DateTime } from 'luxon';
import { appConfig, safeConfigStatus } from '../config.js';
import type { Database } from '../database.js';
import type { DayZStatusService } from '../services/dayz-status.js';
import { createBackup } from '../services/backup.js';
import { latestRepository, repositoryUrls } from '../services/github.js';
import { nextRestart } from '../services/restart.js';
import type { NotificationService } from '../services/notifications.js';
import { isAuthorizedUploadActor, UploadApprovalService } from '../services/upload-approval.js';
import type { FtpUploadExecutor } from '../services/ftp-upload.js';
import type { ExpansionMarketService, MarketItemResult } from '../services/expansion-market.js';
import type { DiscordMusicService } from '../services/discord-music.js';
import { permissionReport, reconcileGuild } from './setup.js';
import { publishEventList, publishModList, publishRoles, publishServerPanels, publishTickets, publishVerification, storedTextChannel } from './panels.js';

const privateReply = { flags: MessageFlags.Ephemeral } as const;
const nowIso = () => new Date().toISOString();
const formatBytes = (bytes:number) => bytes < 1024*1024 ? `${(bytes/1024).toFixed(1)} KiB` : `${(bytes/1024/1024).toFixed(1)} MiB`;
const formatPrice = (value:number|null) => value === null ? '–' : new Intl.NumberFormat('de-DE').format(value);
const formatMarketItem = (item:MarketItemResult) => `**${item.className}** · ${item.categoryName}\nKauf: ${formatPrice(item.minPrice)}–${formatPrice(item.maxPrice)} · Verkauf: ${item.sellPricePercent ?? 0}%\nHändler: ${item.traders.join(', ') || 'keinem Händler zugeordnet'}`;

function assertGuild(interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction) {
  if (!interaction.guild) throw new Error('Dieser Vorgang ist nur auf dem DeutschZ-Discord verfügbar.');
  return interaction.guild;
}

function canAct(actor: GuildMember, target: GuildMember): boolean {
  return actor.id !== target.id && actor.roles.highest.comparePositionTo(target.roles.highest) > 0 && target.id !== target.guild.ownerId;
}

function assertApprover(userId: string, _ownerId?: string): void {
  if (!appConfig.approverUserIds.includes(userId)) throw new Error('Diese Bestätigung ist den per Discord-User-ID fest hinterlegten DeutschZ-Hauptfreigebenden vorbehalten.');
}

const ownerOnlyCommands = new Set(['setup-deutschz','setup-status','config-view','database-status','backup-create','raid-mode']);
const criticalCommands = new Set([
  ...ownerOnlyCommands, 'sync-all','status-refresh','notification-status','announce','maintenance-announce',
  'maintenance-start','maintenance-complete','notify-kothz','giveaway-result','mod-release','mod-changelog',
  'server-panel','verify-panel','roles-panel','ticket-panel','event-panel','mods-add','mods-remove','mods-edit',
  'mods-refresh','restart-test','permissions-check','event-create','event-list','event-edit','event-cancel',
  'event-remind','upload','deploy','push-settings','push-mod','push-file','admin','supporter-vergeben'
]);

function auditCommand(db: Database, interaction: ChatInputCommandInteraction, result: 'STARTED'|'SUCCESS'|'FAILED', detail?: string): void {
  db.run('INSERT INTO security_audit(guild_id,channel_id,actor_user_id,command_name,result,detail,created_at) VALUES(?,?,?,?,?,?,?)', [
    interaction.guildId ?? 'unknown', interaction.channelId, interaction.user.id, interaction.commandName, result,
    detail?.slice(0, 500) ?? null, nowIso()
  ]);
}

async function assertRuntimeCommandPermission(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!criticalCommands.has(interaction.commandName)) return;
  const guild = assertGuild(interaction);
  if (ownerOnlyCommands.has(interaction.commandName)) {
    if (interaction.user.id !== appConfig.OWNER_USER_ID) throw new Error('Dieser Befehl ist ausschließlich für den fest hinterlegten DeutschZ-Inhaber freigegeben.');
    return;
  }
  if (['upload','deploy','push-settings','push-mod','push-file'].includes(interaction.commandName)) return;
  const member = await guild.members.fetch(interaction.user.id);
  if (interaction.user.id !== appConfig.OWNER_USER_ID && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error('Die serverseitige Berechtigungsprüfung hat diesen Befehl abgelehnt.');
  }
}

async function moderation(interaction: ChatInputCommandInteraction, db: Database): Promise<boolean> {
  const guild = assertGuild(interaction);
  const name = interaction.commandName;
  if (!['warn','warnings','warn-remove','timeout','untimeout','kick','ban','unban','clear','slowmode','nickname-reset','modnote'].includes(name)) return false;

  if (name === 'warnings') {
    const user = interaction.options.getUser('nutzer', true);
    const cases = db.rows<{id:number; action:string; reason:string; created_at:string}>('SELECT id,action,reason,created_at FROM moderation_cases WHERE guild_id=? AND user_id=? AND action=\'warn\' ORDER BY id DESC LIMIT 20', [guild.id, user.id]);
    await interaction.reply({ content: cases.length ? cases.map(c => `#${c.id} · ${c.created_at} · ${c.reason}`).join('\n') : 'Keine Verwarnungen gespeichert.', ...privateReply });
    return true;
  }
  if (name === 'warn-remove') {
    const id = interaction.options.getInteger('fall', true);
    db.run('DELETE FROM moderation_cases WHERE id=? AND guild_id=? AND action=\'warn\'', [id, guild.id]);
    await interaction.reply({ content: `Verwarnung #${id} wurde entfernt.`, ...privateReply });
    return true;
  }
  if (name === 'clear') {
    if (!interaction.channel || !('bulkDelete' in interaction.channel)) throw new Error('Dieser Kanal unterstützt kein Bulk-Delete.');
    const count = interaction.options.getInteger('anzahl', true);
    const deleted = await interaction.channel.bulkDelete(count, true);
    await interaction.reply({ content: `${deleted.size} Nachrichten gelöscht.`, ...privateReply });
    return true;
  }
  if (name === 'slowmode') {
    if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) throw new Error('Kein Textkanal.');
    const seconds = interaction.options.getInteger('sekunden', true);
    await interaction.channel.setRateLimitPerUser(seconds, `DeutschZ: ${interaction.user.tag}`);
    await interaction.reply({ content: `Slowmode: ${seconds}s`, ...privateReply });
    return true;
  }
  if (name === 'unban') {
    const id = interaction.options.getString('nutzer_id', true);
    await guild.members.unban(id, `DeutschZ: ${interaction.user.tag}`);
    await interaction.reply({ content: `Ban für ${id} aufgehoben.`, ...privateReply });
    return true;
  }

  const user = interaction.options.getUser('nutzer', true);
  const target = await guild.members.fetch(user.id);
  const actor = await guild.members.fetch(interaction.user.id);
  if (!canAct(actor, target)) throw new Error('Rollenhierarchie schützt dieses Mitglied.');
  const reason = interaction.options.getString('grund') ?? interaction.options.getString('notiz') ?? 'Keine Begründung angegeben';
  if (name === 'timeout') await target.timeout(interaction.options.getInteger('minuten', true) * 60_000, reason);
  else if (name === 'untimeout') await target.timeout(null, `Aufgehoben durch ${interaction.user.tag}`);
  else if (name === 'kick') await target.kick(reason);
  else if (name === 'ban') await target.ban({ reason });
  else if (name === 'nickname-reset') await target.setNickname(null, `Zurückgesetzt durch ${interaction.user.tag}`);

  const action = name === 'modnote' ? 'note' : name;
  db.run('INSERT INTO moderation_cases(guild_id,user_id,moderator_id,action,reason,internal_note,created_at) VALUES(?,?,?,?,?,?,?)', [guild.id,user.id,interaction.user.id,action,reason,name === 'modnote' ? reason : null,nowIso()]);
  const caseId = db.scalar<number>('SELECT MAX(id) FROM moderation_cases')!;
  await interaction.reply({ content: `Moderationsfall #${caseId}: ${name} erfolgreich.`, ...privateReply });
  const log = storedTextChannel(guild, db, '📋・moderations-logs');
  if (log) await log.send({ embeds: [new EmbedBuilder().setColor(0xc0392b).setTitle(`Moderationsfall #${caseId}`).addFields({name:'Aktion',value:name},{name:'Nutzer',value:`<@${user.id}>`},{name:'Moderator',value:`<@${interaction.user.id}>`},{name:'Grund',value:reason})] });
  return true;
}

async function handleCommandInner(interaction: ChatInputCommandInteraction, db: Database, statusService: DayZStatusService, notifications: NotificationService, uploads: UploadApprovalService, market: ExpansionMarketService, music: DiscordMusicService): Promise<void> {
  if (await moderation(interaction, db)) return;
  const guild = assertGuild(interaction);
  const command = interaction.commandName;

  if (command === 'markt') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'uebersicht') {
      const status = market.status();
      const categories = market.categories(12);
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x6da900).setTitle('🛒 DeutschZ Expansion Market').setDescription(categories.length ? categories.map(item => `**${item.displayName}** · ${item.itemCount} Artikel`).join('\n') : 'Der Markt wurde noch nicht importiert.').setFooter({ text: `Letzter Import: ${String(status?.finished_at ?? 'noch keiner')}` })] });
    } else if (sub === 'kategorien') {
      const rows = market.categories(50);
      await interaction.reply({ content: rows.length ? rows.map(row => `**${row.displayName}** (${row.categoryKey}) · ${row.itemCount}`).join('\n').slice(0, 1950) : 'Keine Kategorien importiert.', ...privateReply });
    } else if (sub === 'suche') {
      const rows = market.search(interaction.options.getString('text', true), 10);
      await interaction.reply({ content: rows.length ? rows.map(formatMarketItem).join('\n\n').slice(0, 1950) : 'Kein passender Artikel gefunden.', ...privateReply });
    } else if (sub === 'artikel') {
      const item = market.item(interaction.options.getString('klasse', true));
      await interaction.reply({ content: item ? formatMarketItem(item) : 'Dieser ClassName wurde im aktiven Market-Katalog nicht gefunden.', ...privateReply });
    } else if (sub === 'kategorie') {
      const rows = market.category(interaction.options.getString('name', true), 20);
      await interaction.reply({ content: rows.length ? rows.map(formatMarketItem).join('\n\n').slice(0, 1950) : 'Keine passende Kategorie gefunden.', ...privateReply });
    } else {
      const status = market.status();
      await interaction.reply({ content: status ? `Letzter Import: ${String(status.finished_at ?? status.started_at)}\nKategorien: ${String(status.category_count ?? 0)} · Artikel: ${String(status.item_count ?? 0)} · Händler: ${String(status.trader_count ?? 0)}` : 'Noch kein erfolgreicher Market-Import.', ...privateReply });
    }
    return;
  }

  if (command === 'admin' && interaction.options.getSubcommandGroup() === 'markt') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'sync') {
      await interaction.deferReply(privateReply);
      const result = market.sync(true);
      await interaction.editReply(`Market-Sync abgeschlossen: ${result.categories} Kategorien · ${result.items} Artikel · ${result.traders} Händler · ${result.warnings.length} Warnungen.`);
    } else if (sub === 'quelle') {
      await interaction.reply({ content: `Aktive Nur-Lese-Quelle: \`${market.discoverSourceRoot()}\``, ...privateReply });
    } else {
      const status = market.status();
      const content = status ? `Status: ${String(status.status)}\nStart: ${String(status.started_at)}\nEnde: ${String(status.finished_at ?? 'offen')}\nKategorien: ${String(status.category_count ?? 0)}\nArtikel: ${String(status.item_count ?? 0)}\nHändler: ${String(status.trader_count ?? 0)}\nMeldung: ${String(status.message ?? 'keine')}` : 'Kein Importlauf vorhanden.';
      await interaction.reply({ content, ...privateReply });
    }
    return;
  }

  if (command === 'team') {
    const sub = interaction.options.getSubcommand();
    const description = sub === 'schildwall'
      ? `🛡️ **SCHILDWALL**\n\n<@${appConfig.OWNER_USER_ID}> · Patrick Sluzalek · Inhaber und Projektleitung\n<@769953999163621397> · Halftan · Mitgründer und Hauptfreigeber\n<@526160792538710016> · DevilMagic · Administration\n\nBesonderer Dank an **Halftan** und **DevilMagic** für ihre Hilfe, Unterstützung und die gemeinsame Umsetzung der DeutschZ-Ideen.`
      : `<@${appConfig.OWNER_USER_ID}> · Inhaber / Projektleitung\n<@769953999163621397> · Hauptfreigeber\n<@526160792538710016> · Administrator\n<@${appConfig.HONORARY_USER_ID}> · Spezial-Ehrenmitglied / Supporter\n<@${appConfig.SECOND_HONORARY_USER_ID}> · Spezial-Ehrenmitglied / Supporter`;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x6da900).setTitle(sub === 'schildwall' ? 'DeutschZ Schildwall' : 'DeutschZ Team').setDescription(description)] });
    return;
  }

  if (command === 'unterstuetzen') {
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x6da900).setTitle('❤️ DeutschZ unterstützen').setDescription(`Mit einer freiwilligen Spende hilfst du bei Serverkosten, Events, eigenen Mods, Grafiken, Sounds und Erweiterungen. Eine Unterstützung verschafft **keine unfairen spielerischen Vorteile**.\n\n🔗 [DeutschZ freiwillig unterstützen](${appConfig.DONATION_URL})`)] });
    return;
  }

  if (command === 'musik') {
    const sub = interaction.options.getSubcommand();
    const member = await guild.members.fetch(interaction.user.id);
    if (sub === 'liste') {
      const tracks = music.list();
      await interaction.reply({ content: tracks.length ? tracks.map((track, index) => `${index + 1}. ${track.replace(/\.mp3$/i, '')}`).join('\n').slice(0, 1950) : 'Keine Titel gefunden.', ...privateReply });
    } else if (sub === 'play') {
      const track = await music.play(member, interaction.options.getString('titel') ?? undefined);
      await interaction.reply({ content: `▶️ ${track.replace(/\.mp3$/i, '')}` });
    } else if (sub === 'pause') {
      const paused = music.togglePause(guild.id);
      await interaction.reply({ content: paused ? '⏸️ Wiedergabe pausiert.' : '▶️ Wiedergabe fortgesetzt.', ...privateReply });
    } else if (sub === 'next') {
      const track = await music.next(guild.id);
      await interaction.reply({ content: `⏭️ ${track.replace(/\.mp3$/i, '')}` });
    } else if (sub === 'mute') {
      const muted = music.toggleMute(guild.id);
      await interaction.reply({ content: muted ? '🔇 Musik stummgeschaltet.' : '🔊 Musik wieder hörbar.', ...privateReply });
    } else {
      music.stop(guild.id);
      await interaction.reply({ content: '⏹️ Wiedergabe beendet.', ...privateReply });
    }
    return;
  }

  if (command === 'supporter-vergeben') {
    const target = interaction.options.getUser('nutzer', true);
    const role = guild.roles.cache.find(item => item.name === 'DeutschZ Unterstützer');
    if (!role) throw new Error('Rolle DeutschZ Unterstützer fehlt.');
    const member = await guild.members.fetch(target.id);
    await member.roles.add(role, `Geprüft durch ${interaction.user.id}`);
    db.run('INSERT INTO security_audit(guild_id,channel_id,actor_user_id,command_name,result,detail,created_at) VALUES(?,?,?,?,?,?,?)', [guild.id, interaction.channelId, interaction.user.id, 'supporter-vergeben', 'SUCCESS', `target=${target.id}; proof=${interaction.options.getString('nachweis', true).slice(0, 120)}`, nowIso()]);
    await interaction.reply({ content: `${target} hat die freiwillige Unterstützerrolle erhalten. Sie enthält keine Gameplay- oder Adminvorteile.`, ...privateReply });
    return;
  }

  if (command === 'setup-deutschz') {
    const confirm = new ButtonBuilder().setCustomId('setup:confirm').setLabel('Einrichtung bestätigen').setStyle(ButtonStyle.Danger);
    await interaction.reply({ content: 'Das Setup ergänzt fehlende DeutschZ-Rollen/Kanäle und korrigiert nur verwaltete Elemente. Manuell angelegte Kanäle werden nicht gelöscht.', components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirm)], ...privateReply });
  } else if (['upload','deploy','push-settings','push-mod','push-file'].includes(command)) {
    const source=interaction.options.getString('quelle',true); const target=interaction.options.getString('ziel',true); const member=await guild.members.fetch(interaction.user.id); const uploadType=command==='push-settings'?'settings':command==='push-mod'?'mod':command==='push-file'?'file':command;
    if(!isAuthorizedUploadActor(member,uploadType,target)) throw new Error('Keine Berechtigung für diesen Upload-Typ oder Zielpfad.');
    const approvalChannel=appConfig.UPLOAD_APPROVAL_CHANNEL_ID?guild.channels.cache.get(appConfig.UPLOAD_APPROVAL_CHANNEL_ID):storedTextChannel(guild,db,'🔧・server-management');
    if(!approvalChannel?.isTextBased()||!('send' in approvalChannel)) throw new Error('Upload-Freigabekanal fehlt.');
    const request=uploads.create({requesterUserId:interaction.user.id,guildId:guild.id,channelId:approvalChannel.id,sourcePath:source,targetPath:target,uploadType,serverArea:interaction.options.getString('bereich',true)});
    const embed=new EmbedBuilder().setColor(request.dangerous?0xe74c3c:0xf1c40f).setTitle('FTP-UPLOAD WARTET AUF FREIGABE').addFields(
      {name:'Request-ID',value:request.requestId,inline:true},{name:'Angefordert von',value:`<@${interaction.user.id}>`,inline:true},{name:'Upload-Typ',value:request.uploadType,inline:true},
      {name:'Quelle',value:`\`${request.sourcePath}\``},{name:'Ziel',value:`\`${request.targetPath}\``},{name:'Dateien / Größe',value:`${request.fileCount} / ${formatBytes(request.fileSize)}`,inline:true},
      {name:'SHA-256',value:`\`${request.sha256}\``},{name:'Ablauf',value:`<t:${Math.floor(Date.parse(request.expiresAt)/1000)}:R>`,inline:true},{name:'Vier-Augen-Prinzip',value:appConfig.UPLOAD_REQUIRE_SECOND_APPROVER?'JA':'NEIN',inline:true},{name:'Status',value:'PENDING',inline:true}
    ).setDescription(request.dangerous?'🚨 **KRITISCHER SERVERBEREICH – besonders sorgfältig prüfen.**':'Preflight bestanden. Es wurde noch nichts hochgeladen.');
    const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`upload:approve:${request.requestId}`).setLabel('UPLOAD FREIGEBEN').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`upload:reject:${request.requestId}`).setLabel('ABLEHNEN').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`upload:details:${request.requestId}`).setLabel('DETAILS').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`upload:cancel:${request.requestId}`).setLabel('ABBRECHEN').setStyle(ButtonStyle.Secondary));
    const message=await approvalChannel.send({embeds:[embed],components:[row]}); uploads.setMessage(request.requestId,approvalChannel.id,message.id); await interaction.reply({content:`Upload-Anfrage ${request.requestId} erstellt: <#${approvalChannel.id}>. Es wurde nichts übertragen.`,...privateReply});
  } else if (command === 'setup-status') {
    await interaction.reply({ content: `Setup-Version: ${db.getConfig(guild.id,'setupVersion') ?? 'nicht eingerichtet'}\nGespeicherte Guild-Werte: ${db.scalar<number>('SELECT COUNT(*) FROM guild_config WHERE guild_id=?',[guild.id]) ?? 0}`, ...privateReply });
  } else if (command === 'sync-all') {
    await interaction.deferReply(privateReply);
    const status = await statusService.query(true);
    const jobs: Array<Promise<void>> = [];
    const server = storedTextChannel(guild,db,'🗺️・server-informationen'); if(server) jobs.push(publishServerPanels(server,db,status));
    const mods = storedTextChannel(guild,db,'🧩・modliste'); if(mods) jobs.push(publishModList(mods,db));
    const events = storedTextChannel(guild,db,'🎉・event-ankündigungen'); if(events) jobs.push(publishEventList(events,db));
    const verify = storedTextChannel(guild,db,'✅・verifizierung'); if(verify) jobs.push(publishVerification(verify,db));
    const roles = storedTextChannel(guild,db,'🎭・rollenwahl'); if(roles) jobs.push(publishRoles(roles,db));
    const tickets = storedTextChannel(guild,db,'🎫・ticket-erstellen'); if(tickets) jobs.push(publishTickets(tickets,db));
    await Promise.all(jobs);
    await interaction.editReply(`Synchronisierung abgeschlossen: ${jobs.length} verwaltete Bereiche aktualisiert.`);
  } else if (command === 'config-view') {
    await interaction.reply({ content: '```json\n'+JSON.stringify(safeConfigStatus(), null, 2)+'\n```', ...privateReply });
  } else if (command === 'bot-status') {
    await interaction.reply({ content: `Bot online · Uptime ${Math.floor(process.uptime())}s · DB erreichbar · Discord ${interaction.client.ws.ping}ms`, ...privateReply });
  } else if (command === 'status-refresh') {
    const status = await statusService.query(true);
    await interaction.reply({ content: `Status: ${status.state} · Quelle: ${status.source}`, ...privateReply });
  } else if (command === 'notification-status') {
    await interaction.reply({content:`Serverstatus: ${notifications.getState('dayz:lastState') ?? 'unbekannt'}\nFehlversuche: ${notifications.getState('dayz:failures') ?? '0'}\nLetzte erfolgreiche Abfrage: ${notifications.getState('dayz:lastSuccess') ?? 'keine'}\nWartung: ${notifications.getState('maintenance:state') ?? 'inaktiv'}\nRaid-Modus: ${notifications.getState('raid:mode') ?? 'off'}`,...privateReply});
  } else if (command === 'announce') {
    const link=interaction.options.getString('link'); const body=`${interaction.options.getString('text',true)}\n\n👤 Verantwortlich: <@${interaction.user.id}>${link?`\n🔗 ${link}`:''}`;
    await notifications.announce(guild,interaction.options.getString('titel',true),body,'Community-Ping'); await interaction.reply({content:'Ankündigung gesendet.',...privateReply});
  } else if (command === 'maintenance-announce') {
    const body=`Am DeutschZ-Server werden geplante Arbeiten durchgeführt.\n\n📅 Datum: ${interaction.options.getString('datum',true)}\n🕒 Beginn: ${interaction.options.getString('beginn',true)}\n⏱️ Dauer: ${interaction.options.getString('dauer',true)}\n🔧 Grund: ${interaction.options.getString('grund',true)}\n\nWährend der Wartung kann der Server vorübergehend nicht erreichbar sein.`;
    await notifications.maintenance(guild,'planned',body); await interaction.reply({content:'Wartung angekündigt.',...privateReply});
  } else if (command === 'maintenance-start') {
    await notifications.maintenance(guild,'started','Der DeutschZ-Server wurde für geplante Arbeiten heruntergefahren. Bitte wartet auf die offizielle Freigabe.'); await interaction.reply({content:'Wartungsbeginn gemeldet.',...privateReply});
  } else if (command === 'maintenance-complete') {
    await notifications.maintenance(guild,'completed',`Die Arbeiten wurden beendet.\n\n🟢 Server freigegeben\n🎮 Direktverbindung: ${appConfig.DAYZ_SERVER_IP}:${appConfig.DAYZ_SERVER_PORT}`); await interaction.reply({content:'Wartungsabschluss gemeldet.',...privateReply});
  } else if (command === 'notify-kothz') {
    const status=interaction.options.getString('status',true) as 'announce'|'active'|'progress'|'won'; if(!['announce','active','progress','won'].includes(status)) throw new Error('Status muss announce, active, progress oder won sein.');
    const place=interaction.options.getString('standort')??'wird bekannt gegeben'; const progress=interaction.options.getInteger('fortschritt'); const winner=interaction.options.getString('gewinner')??'wird ermittelt';
    const body=status==='announce'?`📍 Standort: ${place}\n🎯 Ziel: Zone betreten und halten.`:status==='active'?`📍 Standort: ${place}\n💨 Achtet auf den markierten Rauch.`:status==='progress'?`⚔️ Fortschritt: ${progress??0} %\n📍 Position: ${place}`:`👑 Gewinner: ${winner}\n📍 Standort: ${place}\n📦 RewardCrate: freigegeben`;
    await notifications.kothz(guild,status,body); await interaction.reply({content:'KotHZ-Meldung gesendet.',...privateReply});
  } else if (command === 'giveaway-result') {
    await notifications.giveaway(guild,`🏆 Gewinner: ${interaction.options.getString('gewinner',true)}\n🎁 Gewinn: ${interaction.options.getString('gewinn',true)}\n👥 Teilnehmer: ${interaction.options.getInteger('teilnehmer')??'nicht angegeben'}`); await interaction.reply({content:'Giveaway-Ergebnis gesendet.',...privateReply});
  } else if (command === 'mod-release') {
    const mod=interaction.options.getString('mod',true); const version=interaction.options.getString('version',true); const workshop=interaction.options.getString('workshop',true); const state=interaction.options.getString('status')??'Stable'; const changelog=interaction.options.getString('changelog');
    await notifications.send(guild,{type:'mod-release',title:'🚀 ┃ NEUER DEUTSCHZ MOD-RELEASE',body:`⚔️ ${mod}\n📦 Version: ${version}\n🛠️ Status: ${state}\n\n🔗 Workshop: ${workshop}${changelog?`\n📜 Changelog: ${changelog}`:''}`,color:'success',role:'Update-Ping',channelName:'🚀・mod-releases'}); await interaction.reply({content:'Mod-Release veröffentlicht.',...privateReply});
  } else if (command === 'mod-changelog') {
    const mod=interaction.options.getString('mod',true); const version=interaction.options.getString('version',true); const body=interaction.options.getString('text',true);
    await notifications.send(guild,{type:'mod-changelog',title:`📜 ┃ ${mod.toUpperCase()} v${version}`,body,color:'neutral',channelName:'📜・mod-changelogs'}); await interaction.reply({content:'Changelog archiviert.',...privateReply});
  } else if (command === 'raid-mode') {
    assertApprover(interaction.user.id,guild.ownerId); const value=interaction.options.getString('status',true).toLowerCase(); if(!['on','off'].includes(value)) throw new Error('Status muss on oder off sein.'); await notifications.setRaidMode(guild,value==='on',interaction.user.id); await interaction.reply({content:`Raid-Modus: ${value}`,...privateReply});
  } else if (command === 'restart-next' || command === 'restart-test') {
    const restart = nextRestart(DateTime.now(), appConfig.restartTimes, appConfig.TIMEZONE);
    await interaction.reply({ content: `Nächster Restart: ${restart.label}`, ...privateReply });
  } else if (command === 'permissions-check') {
    await interaction.reply({ content: permissionReport(guild).join('\n'), ...privateReply });
  } else if (command === 'database-status') {
    await interaction.reply({ content: `SQLite aktiv · Migration ${db.scalar<number>('SELECT MAX(version) FROM schema_migrations') ?? 0} · Mods ${db.listMods().length}`, ...privateReply });
  } else if (command === 'backup-create') {
    const target = createBackup(db);
    await interaction.reply({ content: `Backup erstellt: ${target.split(/[\\/]/).pop()}`, ...privateReply });
  } else if (command === 'mods') {
    await interaction.reply({ content: `${db.listMods().join('\n')}\n\n*Die Modliste kann sich während der Aufbauphase noch ändern.*`, ...privateReply });
  } else if (command === 'mods-add') {
    const name=interaction.options.getString('name',true); db.addMod(name); await notifications.modUpdate(guild,`➕ Hinzugefügt:\n• ${name}\n\n⚠️ Bitte startet euren DayZ-Launcher neu und prüft eure Mods.`);
    await interaction.reply({ content: 'Mod hinzugefügt.', ...privateReply });
  } else if (command === 'mods-remove') {
    const name=interaction.options.getString('name',true); const removed=db.removeMod(name); if(removed) await notifications.modUpdate(guild,`➖ Entfernt:\n• ${name}\n\n⚠️ Bitte startet euren DayZ-Launcher neu und prüft eure Mods.`); await interaction.reply({ content: removed ? 'Mod entfernt.' : 'Mod nicht gefunden.', ...privateReply });
  } else if (command === 'mods-edit') {
    const oldName = interaction.options.getString('alt',true); const newName = interaction.options.getString('neu',true);
    db.run('UPDATE mods SET name=? WHERE name=?',[newName,oldName]); await notifications.modUpdate(guild,`🔄 Aktualisiert:\n• ${oldName} → ${newName}`);
    await interaction.reply({ content: 'Modbezeichnung aktualisiert.', ...privateReply });
  } else if (command === 'mods-refresh') {
    const channel = storedTextChannel(guild, db, '🧩・modliste'); if (!channel) throw new Error('Modlisten-Kanal fehlt. Setup ausführen.');
    await publishModList(channel,db); await interaction.reply({content:'Modlisten-Panel aktualisiert.',...privateReply});
  } else if (command === 'server-panel') {
    const channel = storedTextChannel(guild,db,'🗺️・server-informationen'); if (!channel) throw new Error('Serverinfo-Kanal fehlt.');
    await publishServerPanels(channel,db,await statusService.query()); await interaction.reply({content:'Serverpanels aktualisiert.',...privateReply});
  } else if (command === 'verify-panel') {
    const channel = storedTextChannel(guild,db,'✅・verifizierung'); if (!channel) throw new Error('Verifizierungskanal fehlt.');
    await publishVerification(channel,db); await interaction.reply({content:'Verifizierungs-Panel aktualisiert.',...privateReply});
  } else if (command === 'roles-panel') {
    const channel = storedTextChannel(guild,db,'🎭・rollenwahl'); if (!channel) throw new Error('Rollenkanal fehlt.');
    await publishRoles(channel,db); await interaction.reply({content:'Rollen-Panel aktualisiert.',...privateReply});
  } else if (command === 'ticket-panel') {
    const channel = storedTextChannel(guild,db,'🎫・ticket-erstellen'); if (!channel) throw new Error('Ticketkanal fehlt.');
    await publishTickets(channel,db); await interaction.reply({content:'Ticket-Panel aktualisiert.',...privateReply});
  } else if (command === 'event-panel') {
    const channel = storedTextChannel(guild,db,'🎉・event-ankündigungen'); if (!channel) throw new Error('Eventkanal fehlt.');
    await publishEventList(channel,db); await interaction.reply({content:'Event-Panel aktualisiert.',...privateReply});
  } else if (command === 'event-create') {
    const local = DateTime.fromFormat(interaction.options.getString('start',true),'yyyy-MM-dd HH:mm',{zone:appConfig.TIMEZONE});
    const start = local.isValid ? local.toUTC().toISO()! : DateTime.fromISO(interaction.options.getString('start',true),{zone:appConfig.TIMEZONE}).toUTC().toISO();
    if (!start) throw new Error('Ungültiges Datum. Nutze YYYY-MM-DD HH:mm.');
    const title=interaction.options.getString('titel',true); const description=interaction.options.getString('beschreibung',true); const max=interaction.options.getInteger('max',true); const reward=interaction.options.getString('belohnung') ?? 'wird bekanntgegeben';
    db.run('INSERT INTO events(guild_id,title,description,starts_at,max_participants,reward,owner_id) VALUES(?,?,?,?,?,?,?)',[guild.id,title,description,start,max,reward,interaction.user.id]);
    const eventId=db.scalar<number>('SELECT MAX(id) FROM events')!; const eventChannel=storedTextChannel(guild,db,'🎉・event-ankündigungen');
    if(eventChannel){const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`event:join:${eventId}`).setLabel('Teilnehmen').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`event:leave:${eventId}`).setLabel('Abmelden').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`event:list:${eventId}`).setLabel('Teilnehmer').setStyle(ButtonStyle.Primary)); const message=await eventChannel.send({embeds:[new EmbedBuilder().setColor(0x6da900).setTitle(`#${eventId} ${title}`).setDescription(description).addFields({name:'Start',value:start},{name:'Max. Teilnehmer',value:String(max),inline:true},{name:'Belohnung',value:reward,inline:true},{name:'Verantwortlich',value:`<@${interaction.user.id}>`})],components:[row]}); db.run('UPDATE events SET channel_id=?,message_id=? WHERE id=?',[eventChannel.id,message.id,eventId]);}
    await interaction.reply({content:`Event #${eventId} erstellt.`,...privateReply});
  } else if (command === 'event-list') {
    const rows=db.rows<{id:number;title:string;starts_at:string}>('SELECT id,title,starts_at FROM events WHERE guild_id=? AND status=\'active\' ORDER BY starts_at',[guild.id]);
    await interaction.reply({content:rows.length?rows.map(e=>`#${e.id} ${e.title} · ${e.starts_at}`).join('\n'):'Keine aktiven Events.',...privateReply});
  } else if (command === 'event-edit') {
    db.run('UPDATE events SET title=? WHERE id=? AND guild_id=?',[interaction.options.getString('titel',true),interaction.options.getInteger('id',true),guild.id]); await interaction.reply({content:'Event aktualisiert.',...privateReply});
  } else if (command === 'event-cancel') {
    db.run('UPDATE events SET status=\'cancelled\' WHERE id=? AND guild_id=?',[interaction.options.getInteger('id',true),guild.id]); await interaction.reply({content:'Event abgesagt.',...privateReply});
  } else if (command === 'event-remind') {
    const id=interaction.options.getInteger('id',true); const event=db.rows<{title:string;starts_at:string}>('SELECT title,starts_at FROM events WHERE id=? AND guild_id=?',[id,guild.id])[0]; if(!event) throw new Error('Event nicht gefunden.');
    const channel=storedTextChannel(guild,db,'🎉・event-ankündigungen'); if(!channel) throw new Error('Eventkanal fehlt.'); await channel.send(`Event-Erinnerung: **${event.title}** startet ${event.starts_at}.`); await interaction.reply({content:'Erinnerung gesendet.',...privateReply});
  } else if (command === 'github-links') {
    await interaction.reply({content:`Server Settings: ${appConfig.SERVER_SETTINGS_REPOSITORY}\nModZ: ${appConfig.MODZ_REPOSITORY}\nNur lesende Integration aktiv.`,...privateReply});
  } else if (command === 'github-status' || command === 'github-latest') {
    await interaction.deferReply(privateReply); const results=await Promise.allSettled(repositoryUrls.map(latestRepository)); const lines=results.map((result,index)=>result.status==='fulfilled'?`${repositoryUrls[index]}\n${result.value.commit} · ${result.value.message}`:`${repositoryUrls[index]}\nvorübergehend nicht erreichbar`); await interaction.editReply(lines.join('\n\n'));
  } else if (command === 'suggest') {
    const modal=new ModalBuilder().setCustomId('suggest:submit').setTitle('DeutschZ Vorschlag');
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Titel').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Beschreibung').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)));
    await interaction.showModal(modal);
  }
}

export async function handleCommand(interaction: ChatInputCommandInteraction, db: Database, statusService: DayZStatusService, notifications: NotificationService, uploads: UploadApprovalService, market: ExpansionMarketService, music: DiscordMusicService): Promise<void> {
  const audited = criticalCommands.has(interaction.commandName) || ['warn','warnings','warn-remove','timeout','untimeout','kick','ban','unban','clear','slowmode','nickname-reset','modnote'].includes(interaction.commandName);
  if (audited) auditCommand(db, interaction, 'STARTED');
  try {
    await assertRuntimeCommandPermission(interaction);
    await handleCommandInner(interaction, db, statusService, notifications, uploads, market, music);
    if (audited) auditCommand(db, interaction, 'SUCCESS');
  } catch (error) {
    if (audited) auditCommand(db, interaction, 'FAILED', error instanceof Error ? error.message : 'Unbekannter Fehler');
    throw error;
  }
}

export async function handleButton(interaction: ButtonInteraction, db: Database, uploads: UploadApprovalService, ftpExecutor: FtpUploadExecutor): Promise<void> {
  if (interaction.customId === 'responsibility:ack:v2') {
    const guildId = appConfig.DISCORD_GUILD_ID ?? 'dm';
    const alreadyAcknowledged = db.getConfig(guildId, `responsibilityAck:v2:${interaction.user.id}`);
    if (alreadyAcknowledged) {
      await interaction.update({ content: `${interaction.message.content}\n\n✅ **Bereits bestätigt:** ${alreadyAcknowledged}`, components: [] });
      return;
    }
    const acknowledgedAt = new Date().toISOString();
    db.setConfig(guildId, `responsibilityAck:v2:${interaction.user.id}`, acknowledgedAt);
    db.run('INSERT INTO security_audit(guild_id,channel_id,actor_user_id,command_name,result,detail,created_at) VALUES(?,?,?,?,?,?,?)', [appConfig.DISCORD_GUILD_ID ?? 'dm', interaction.channelId, interaction.user.id, 'responsibility-ack', 'SUCCESS', 'security-and-ftp-workflow-v2 acknowledged', nowIso()]);
    await interaction.update({ content: `${interaction.message.content}\n\n✅ **Bestätigt:** Gelesen und verstanden am ${new Date(acknowledgedAt).toLocaleString('de-DE')}.`, components: [] });
    return;
  }
  const guild=assertGuild(interaction);
  if(interaction.customId.startsWith('upload:')){
    const [,action,requestId]=interaction.customId.split(':'); if(!requestId) throw new Error('Ungültige Upload-Anfrage.'); const request=uploads.get(requestId); if(!request) throw new Error('Upload-Anfrage nicht gefunden.');
    if(action==='details'){await interaction.reply({content:`**${request.requestId}**\nStatus: ${request.status}\nQuelle: \`${request.sourcePath}\`\nZiel: \`${request.targetPath}\`\nDateien: ${request.fileCount}\nGröße: ${formatBytes(request.fileSize)}\nSHA-256: \`${request.sha256}\`\nAblauf: ${request.expiresAt}`, ...privateReply}); return;}
    if(action==='cancel'){uploads.cancel(requestId,interaction.user.id); await interaction.update({components:[],embeds:[EmbedBuilder.from(interaction.message.embeds[0]!).addFields({name:'Abschlussstatus',value:'CANCELLED'})]}); return;}
    const member=await guild.members.fetch(interaction.user.id); if(!isAuthorizedUploadActor(member,request.uploadType,request.targetPath)) throw new Error('Freigabeberechtigung fehlt oder wurde entzogen.');
    if(action==='reject'){uploads.reject(requestId,interaction.user.id); await interaction.update({components:[],embeds:[EmbedBuilder.from(interaction.message.embeds[0]!).addFields({name:'Abschlussstatus',value:'REJECTED'})]}); return;}
    if(action==='approve'){const phrase=uploads.beginApproval(requestId,interaction.user.id); if(!phrase){await interaction.update({components:[],embeds:[EmbedBuilder.from(interaction.message.embeds[0]!).addFields({name:'Abschlussstatus',value:'UPLOADING'})]});await uploads.execute(requestId,ftpExecutor);await interaction.message.edit({components:[],embeds:[EmbedBuilder.from(interaction.message.embeds[0]!).addFields({name:'Transferstatus',value:'SUCCESS'})]});return;} const modal=new ModalBuilder().setCustomId(`upload:confirm:${requestId}`).setTitle('Kritischen Upload bestätigen'); modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('confirmation').setLabel(phrase).setPlaceholder('Exakten Text aus der Feldbezeichnung eingeben').setStyle(TextInputStyle.Short).setRequired(true))); await interaction.showModal(modal); return;}
  } else if(interaction.customId==='setup:confirm'){
    assertApprover(interaction.user.id, guild.ownerId);
    const changes=await reconcileGuild(guild,db); await interaction.update({content:changes.length?`Setup abgeschlossen:\n${changes.join('\n')}`:'Setup war bereits vollständig und idempotent.',components:[]});
  } else if(interaction.customId==='verify:accept'){
    const member=await guild.members.fetch(interaction.user.id); for(const name of ['Verifiziert','Survivor']){const role=guild.roles.cache.find(r=>r.name===name); if(role&&!member.roles.cache.has(role.id)) await member.roles.add(role,'Regeln akzeptiert');}
    db.run('INSERT OR IGNORE INTO verifications(guild_id,user_id,verified_at) VALUES(?,?,?)',[guild.id,interaction.user.id,nowIso()]); await interaction.reply({content:'Regeln akzeptiert. Du bist jetzt verifiziert.',...privateReply});
  } else if(interaction.customId==='server:address') await interaction.reply({content:`Serveradresse: \`${appConfig.DAYZ_SERVER_IP}:${appConfig.DAYZ_SERVER_PORT}\``,...privateReply});
  else if(interaction.customId==='server:mods') await interaction.reply({content:db.listMods().join('\n'),...privateReply});
  else if(interaction.customId.startsWith('ticket:close:')){
    const id=Number(interaction.customId.split(':')[2]); db.run('UPDATE tickets SET status=\'closed\',updated_at=? WHERE id=?',[nowIso(),id]); if(interaction.channel?.type===ChannelType.GuildText) await interaction.channel.permissionOverwrites.edit(interaction.user.id,{SendMessages:false}); await interaction.reply({content:`Ticket #${id} geschlossen.`,...privateReply});
  } else if(interaction.customId.startsWith('ticket:reopen:')){
    const id=Number(interaction.customId.split(':')[2]); db.run('UPDATE tickets SET status=\'open\',updated_at=? WHERE id=?',[nowIso(),id]); if(interaction.channel?.type===ChannelType.GuildText) await interaction.channel.permissionOverwrites.edit(interaction.user.id,{SendMessages:true}); await interaction.reply({content:`Ticket #${id} wieder geöffnet.`,...privateReply});
  } else if(interaction.customId.startsWith('ticket:claim:')){
    const id=Number(interaction.customId.split(':')[2]); db.run('UPDATE tickets SET claimed_by=?,updated_at=? WHERE id=?',[interaction.user.id,nowIso(),id]); await interaction.reply({content:`Ticket #${id} wurde von <@${interaction.user.id}> übernommen.`});
  } else if(interaction.customId.startsWith('ticket:priority:')){
    const id=Number(interaction.customId.split(':')[2]); const current=db.scalar<string>('SELECT priority FROM tickets WHERE id=?',[id])??'normal'; const next=current==='hoch'?'normal':'hoch'; db.run('UPDATE tickets SET priority=?,updated_at=? WHERE id=?',[next,nowIso(),id]); await interaction.reply({content:`Priorität von Ticket #${id}: ${next}`,...privateReply});
  } else if(interaction.customId.startsWith('ticket:transcript:')){
    const id=Number(interaction.customId.split(':')[2]); if(interaction.channel?.type!==ChannelType.GuildText) throw new Error('Kein Ticket-Textkanal.'); const messages=await interaction.channel.messages.fetch({limit:100}); const transcript=[...messages.values()].reverse().map(m=>`[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content.replace(/\r?\n/g,' ')}`).join('\n'); const log=storedTextChannel(guild,db,'🎫・ticket-logs'); if(!log) throw new Error('Ticket-Logkanal fehlt.'); await log.send({content:`Transcript Ticket #${id}`,files:[{attachment:Buffer.from(transcript||'Keine Textnachrichten.','utf8'),name:`ticket-${id}.txt`}]}); await interaction.reply({content:'Transcript wurde im Team-Log gespeichert.',...privateReply});
  } else if(interaction.customId.startsWith('ticket:delete-request:')){
    const id=Number(interaction.customId.split(':')[2]); const confirm=new ButtonBuilder().setCustomId(`ticket:delete-confirm:${id}`).setLabel('Endgültig löschen').setStyle(ButtonStyle.Danger); await interaction.reply({content:'Dieser Kanal wird nach Bestätigung endgültig gelöscht. Das Transcript vorher sichern.',components:[new ActionRowBuilder<ButtonBuilder>().addComponents(confirm)],...privateReply});
  } else if(interaction.customId.startsWith('ticket:delete-confirm:')){
    assertApprover(interaction.user.id, guild.ownerId);
    const id=Number(interaction.customId.split(':')[2]); if(interaction.channel?.type!==ChannelType.GuildText) throw new Error('Kein Ticketkanal.'); db.run('UPDATE tickets SET status=\'deleted\',updated_at=? WHERE id=?',[nowIso(),id]); await interaction.reply({content:`Ticket #${id} wird gelöscht.`,...privateReply}); await interaction.channel.delete(`Ticket #${id} bestätigt gelöscht`);
  } else if(interaction.customId.startsWith('event:')){
    const [,action,idRaw]=interaction.customId.split(':'); const eventId=Number(idRaw); const event=db.rows<{max_participants:number}>('SELECT max_participants FROM events WHERE id=? AND guild_id=? AND status=\'active\'',[eventId,guild.id])[0]; if(!event) throw new Error('Event ist nicht aktiv.');
    if(action==='join'){const joined=db.scalar<number>('SELECT COUNT(*) FROM event_participants WHERE event_id=? AND state=\'joined\'',[eventId])??0; const state=joined<event.max_participants?'joined':'waitlist'; db.run('INSERT INTO event_participants(event_id,user_id,state,joined_at) VALUES(?,?,?,?) ON CONFLICT(event_id,user_id) DO UPDATE SET state=excluded.state,joined_at=excluded.joined_at',[eventId,interaction.user.id,state,nowIso()]); await interaction.reply({content:state==='joined'?'Teilnahme bestätigt.':'Event voll – du stehst auf der Warteliste.',...privateReply});}
    else if(action==='leave'){db.run('DELETE FROM event_participants WHERE event_id=? AND user_id=?',[eventId,interaction.user.id]); const waiting=db.rows<{user_id:string}>('SELECT user_id FROM event_participants WHERE event_id=? AND state=\'waitlist\' ORDER BY joined_at LIMIT 1',[eventId])[0]; if(waiting) db.run('UPDATE event_participants SET state=\'joined\' WHERE event_id=? AND user_id=?',[eventId,waiting.user_id]); await interaction.reply({content:'Du wurdest abgemeldet.',...privateReply});}
    else {const rows=db.rows<{user_id:string;state:string}>('SELECT user_id,state FROM event_participants WHERE event_id=? ORDER BY state,joined_at',[eventId]); await interaction.reply({content:rows.length?rows.map(r=>`${r.state==='joined'?'Teilnahme':'Warteliste'}: <@${r.user_id}>`).join('\n'):'Noch keine Anmeldungen.',...privateReply});}
  } else if(interaction.customId.startsWith('suggest:vote:')){
    const [, , idRaw, voteRaw]=interaction.customId.split(':'); const vote=voteRaw==='up'?1:-1; db.run('INSERT INTO suggestion_votes(suggestion_id,user_id,vote) VALUES(?,?,?) ON CONFLICT(suggestion_id,user_id) DO UPDATE SET vote=excluded.vote',[Number(idRaw),interaction.user.id,vote]); await interaction.reply({content:'Stimme gespeichert.',...privateReply});
  }
}

export async function handleSelect(interaction:StringSelectMenuInteraction,db:Database):Promise<void>{
  const guild=assertGuild(interaction);
  if(interaction.customId==='roles:select'){
    const allowed=['PvP','PvE','Solo','Gruppe sucht Spieler','Event-Ping','Restart-Ping','Update-Ping','Wartungs-Ping','Serverstatus-Ping','Giveaway-Ping','Community-Ping','Testserver-Ping','Content-Ping','KotHZ-Ping']; const member=await guild.members.fetch(interaction.user.id);
    for(const name of allowed){const role=guild.roles.cache.find(r=>r.name===name); if(!role)continue; if(interaction.values.includes(name)) await member.roles.add(role); else if(member.roles.cache.has(role.id)) await member.roles.remove(role);}
    await interaction.reply({content:'Deine Rollen wurden synchronisiert.',...privateReply});
  } else if(interaction.customId==='ticket:create'){
    const type=interaction.values[0]!; const open=db.scalar<number>('SELECT COUNT(*) FROM tickets WHERE guild_id=? AND owner_id=? AND status=\'open\'',[guild.id,interaction.user.id])??0; if(open>=appConfig.MAX_OPEN_TICKETS) throw new Error(`Maximal ${appConfig.MAX_OPEN_TICKETS} offene Tickets erlaubt.`);
    const modal=new ModalBuilder().setCustomId(`ticket:submit:${type}`).setTitle('DeutschZ Ticket'); modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('subject').setLabel('Betreff / betroffene Person').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Beschreibung, Zeitpunkt und Beweise').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800))); await interaction.showModal(modal);
  }
}

export async function handleModal(interaction:ModalSubmitInteraction,db:Database,uploads:UploadApprovalService,ftpExecutor:FtpUploadExecutor):Promise<void>{
  const guild=assertGuild(interaction);
  if(interaction.customId.startsWith('upload:confirm:')){
    const requestId=interaction.customId.split(':')[2]!; const request=uploads.get(requestId); if(!request) throw new Error('Upload-Anfrage nicht gefunden.'); const member=await guild.members.fetch(interaction.user.id); if(!isAuthorizedUploadActor(member,request.uploadType,request.targetPath)) throw new Error('Freigabeberechtigung fehlt oder wurde entzogen.'); uploads.confirm(requestId,interaction.user.id,interaction.fields.getTextInputValue('confirmation'));
    const row=db.rows<{channel_id:string;message_id:string}>('SELECT channel_id,message_id FROM upload_requests WHERE request_id=?',[requestId])[0]; if(row){const channel=guild.channels.cache.get(row.channel_id);if(channel?.isTextBased()&&'messages' in channel){const message=await channel.messages.fetch(row.message_id).catch(()=>null);if(message)await message.edit({components:[],embeds:[EmbedBuilder.from(message.embeds[0]!).addFields({name:'Abschlussstatus',value:'APPROVED'})]});}}
    await interaction.deferReply(privateReply);
    await uploads.execute(requestId,ftpExecutor);
    if(row){const channel=guild.channels.cache.get(row.channel_id);if(channel?.isTextBased()&&'messages' in channel){const message=await channel.messages.fetch(row.message_id).catch(()=>null);if(message)await message.edit({components:[],embeds:[EmbedBuilder.from(message.embeds[0]!).addFields({name:'Transferstatus',value:'SUCCESS'})]});}}
    await interaction.editReply(`${requestId} wurde freigegeben und atomar übertragen.`);
  } else if(interaction.customId.startsWith('ticket:submit:')){
    const type=interaction.customId.split(':')[2]!; const subject=interaction.fields.getTextInputValue('subject'); const details=interaction.fields.getTextInputValue('details');
    const category=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name==='SUPPORT'); const teamRoles=['Inhaber','Projektleitung','Administrator','Moderator','Supporter'].map(n=>guild.roles.cache.find(r=>r.name===n)?.id).filter((x):x is string=>Boolean(x));
    const channel=await guild.channels.create({name:`ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,12)}`,type:ChannelType.GuildText,parent:category?.id,permissionOverwrites:[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},...teamRoles.map(id=>({id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}))]});
    db.run('INSERT INTO tickets(guild_id,channel_id,owner_id,type,status,priority,created_at,updated_at) VALUES(?,?,?,?,\'open\',\'normal\',?,?)',[guild.id,channel.id,interaction.user.id,type,nowIso(),nowIso()]); const id=db.scalar<number>('SELECT MAX(id) FROM tickets')!; await channel.setName(`ticket-${id}`);
    const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`ticket:close:${id}`).setLabel('Schließen').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`ticket:reopen:${id}`).setLabel('Wieder öffnen').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`ticket:claim:${id}`).setLabel('Übernehmen').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId(`ticket:priority:${id}`).setLabel('Priorität').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`ticket:transcript:${id}`).setLabel('Transcript').setStyle(ButtonStyle.Secondary)); const deleteRow=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`ticket:delete-request:${id}`).setLabel('Endgültig löschen').setStyle(ButtonStyle.Danger)); await channel.send({content:`<@${interaction.user.id}>`,embeds:[new EmbedBuilder().setColor(0x6da900).setTitle(`Ticket #${id} · ${subject}`).setDescription(details).setFooter({text:`Typ: ${type}`})],components:[row,deleteRow]}); await interaction.reply({content:`Ticket erstellt: <#${channel.id}>`,...privateReply});
  } else if(interaction.customId==='suggest:submit'){
    const title=interaction.fields.getTextInputValue('title'); const description=interaction.fields.getTextInputValue('description'); db.run('INSERT INTO suggestions(guild_id,author_id,title,description,created_at) VALUES(?,?,?,?,?)',[guild.id,interaction.user.id,title,description,nowIso()]); const id=db.scalar<number>('SELECT MAX(id) FROM suggestions')!; const channel=storedTextChannel(guild,db,'💡・server-vorschläge'); if(!channel) throw new Error('Vorschlagskanal fehlt.'); const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`suggest:vote:${id}:up`).setLabel('Dafür').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`suggest:vote:${id}:down`).setLabel('Dagegen').setStyle(ButtonStyle.Danger)); const message=await channel.send({embeds:[new EmbedBuilder().setColor(0x6da900).setTitle(`#${id} ${title}`).setDescription(description).addFields({name:'Status',value:'Eingereicht'},{name:'Verfasser',value:`<@${interaction.user.id}>`})],components:[row]}); db.run('UPDATE suggestions SET channel_id=?,message_id=? WHERE id=?',[channel.id,message.id,id]); await interaction.reply({content:`Vorschlag #${id} veröffentlicht.`,...privateReply});
  }
}
