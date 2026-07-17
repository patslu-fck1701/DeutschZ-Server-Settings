import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Guild, MessageCreateOptions, MessageEditOptions,
  StringSelectMenuBuilder, TextChannel
} from 'discord.js';
import { appConfig } from '../config.js';
import type { Database } from '../database.js';
import type { DayZStatus } from '../types.js';
import { nextRestart } from '../services/restart.js';
import { DateTime } from 'luxon';

async function upsert(channel: TextChannel, db: Database, guildId: string, key: string, payload: MessageCreateOptions) {
  const messageId = db.getConfig(guildId, `panel:${key}`);
  if (messageId) {
    const existing = await channel.messages.fetch(messageId).catch(() => null);
    if (existing) {
      await existing.edit(payload as MessageEditOptions);
      return existing;
    }
  }
  const message = await channel.send(payload);
  db.setConfig(guildId, `panel:${key}`, message.id);
  return message;
}

export async function publishWelcome(channel:TextChannel,db:Database):Promise<void>{
  await upsert(channel,db,channel.guild.id,'welcome-info',{embeds:[new EmbedBuilder().setColor(0x2b2d31).setTitle('👋 ┃ WILLKOMMEN BEI DEUTSCHZ').setDescription(`Deutschsprachige Modded-DayZ-Community auf Chernarusplus.\n\n📜 Lies das Regelwerk.\n✅ Verifiziere dich.\n🎭 Wähle deine Rollen und Benachrichtigungen.\n🗺️ Prüfe Serverinformationen und Modliste.\n\n🎮 **${appConfig.DAYZ_SERVER_IP}:${appConfig.DAYZ_SERVER_PORT}**\n\n☣️ DeutschZ – Überlebe nicht einfach. Hinterlasse deine Geschichte.`)]});
}

export async function publishRules(channel:TextChannel,db:Database):Promise<void>{
  await upsert(channel,db,channel.guild.id,'rules',{embeds:[new EmbedBuilder().setColor(0x2b2d31).setTitle('📜 ┃ DEUTSCHZ REGELWERK').setDescription(['1. Respektvoller Umgang; keine Hetze, Diskriminierung oder Beleidigungen.','2. Keine Cheats, Exploits oder absichtlicher Bug-Abuse.','3. Keine Werbung oder Massenerwähnungen ohne Freigabe.','4. Support, Reports und Ban-Einsprüche gehören in das Ticketsystem.','5. Teamentscheidungen und das jeweils aktuelle Ingame-Regelwerk sind zu beachten.','','Die ausführliche Fassung und Änderungen werden in diesem Kanal dokumentiert.'].join('\n'))]});
}

export async function publishLinks(channel:TextChannel,db:Database):Promise<void>{
  await upsert(channel,db,channel.guild.id,'links',{embeds:[new EmbedBuilder().setColor(0x3498db).setTitle('🌐 ┃ DEUTSCHZ LINKS').setDescription(`🎮 **Server:** ${appConfig.DAYZ_SERVER_IP}:${appConfig.DAYZ_SERVER_PORT}\n💬 **Discord:** ${appConfig.DISCORD_INVITE_URL}\n🌐 **Website/Wiki:** ${appConfig.WEBSITE_URL}\n🛠️ **Server Settings:** ${appConfig.SERVER_SETTINGS_REPOSITORY}\n🧩 **DeutschZ ModZ:** ${appConfig.MODZ_REPOSITORY}`)]});
}

export async function publishWorkshopLinks(channel:TextChannel,db:Database):Promise<void>{
  await upsert(channel,db,channel.guild.id,'workshop-links',{embeds:[new EmbedBuilder().setColor(0x2b2d31).setTitle('📦 ┃ DEUTSCHZ MODS').setDescription('Hier werden die offiziellen Workshop-Links der eigenen DeutschZ-Mods gepflegt.\n\n🚀 Releases: <#'+(db.getConfig(channel.guild.id,'channel:🚀・mod-releases')??channel.id)+'>\n📜 Changelogs: <#'+(db.getConfig(channel.guild.id,'channel:📜・mod-changelogs')??channel.id)+'>\n🐛 Bugreports: <#'+(db.getConfig(channel.guild.id,'channel:🐛・mod-bugreports')??channel.id)+'>\n📘 Dokumentation: <#'+(db.getConfig(channel.guild.id,'channel:📘・mod-dokumentation')??channel.id)+'>')]});
}

export async function publishVerification(channel: TextChannel, db: Database): Promise<void> {
  const embed = new EmbedBuilder().setColor(0x6da900).setTitle('DeutschZ – Regelwerk & Verifizierung')
    .setDescription([
      'Willkommen bei **DeutschZ**. Mit der Bestätigung akzeptierst du:',
      '• respektvollen Umgang und keine Diskriminierung, Hetze oder Beleidigungen',
      '• keine Cheats, Exploits oder absichtlichen Bug-Abuse',
      '• keine Werbung ohne Genehmigung',
      '• Supportfälle und Meldungen gehören in das Ticket-System',
      '',
      `Detaillierte Ingame-Regeln können aktualisiert werden. [Website im Aufbau](${appConfig.WEBSITE_URL})`
    ].join('\n'));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('verify:accept').setLabel('Regeln akzeptieren').setStyle(ButtonStyle.Success));
  await upsert(channel, db, channel.guild.id, 'verification', { embeds: [embed], components: [row] });
}

export async function publishRoles(channel: TextChannel, db: Database): Promise<void> {
  const roles = ['PvP', 'PvE', 'Solo', 'Gruppe sucht Spieler', 'Event-Ping', 'Restart-Ping', 'Update-Ping', 'Wartungs-Ping', 'Serverstatus-Ping', 'Giveaway-Ping', 'Community-Ping', 'Testserver-Ping', 'Content-Ping', 'KotHZ-Ping'];
  const select = new StringSelectMenuBuilder().setCustomId('roles:select').setPlaceholder('Rollen hinzufügen oder entfernen').setMinValues(0).setMaxValues(roles.length)
    .addOptions(roles.map(name => ({ label: name, value: name })));
  await upsert(channel, db, channel.guild.id, 'roles', {
    embeds: [new EmbedBuilder().setColor(0x6da900).setTitle('DeutschZ Rollenwahl').setDescription('Wähle deine Interessen. Eine erneute Auswahl synchronisiert die Rollen.')],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)]
  });
}

export async function publishTickets(channel: TextChannel, db: Database): Promise<void> {
  const select = new StringSelectMenuBuilder().setCustomId('ticket:create').setPlaceholder('Ticketart auswählen').addOptions([
    ['Allgemeiner Support', 'support'], ['Spieler melden', 'report'], ['Bug melden', 'bug'], ['Ban-Einspruch', 'appeal'], ['Teambewerbung', 'application']
  ].map(([label, value]) => ({ label: label!, value: value! })));
  await upsert(channel, db, channel.guild.id, 'tickets', {
    embeds: [new EmbedBuilder().setColor(0x6da900).setTitle('DeutschZ Support').setDescription('Wähle die passende Ticketart. Deine Angaben sind nur für dich und das zuständige Team sichtbar.')],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)]
  });
}

export function statusEmbed(status: DayZStatus, modCount: number): EmbedBuilder {
  const restart = nextRestart(DateTime.now(), appConfig.restartTimes, appConfig.TIMEZONE);
  const stateText = status.state === 'online' ? 'ONLINE' : status.state === 'offline' ? 'OFFLINE' : 'Statusabfrage derzeit nicht verfügbar';
  const color = status.state === 'online' ? 0x2ecc71 : status.state === 'offline' ? 0xe74c3c : 0xf1c40f;
  const playerText = status.players === null ? `? / ${status.maxPlayers}` : `${status.players} / ${status.maxPlayers}`;
  return new EmbedBuilder().setColor(color).setTitle(`${appConfig.SERVER_NAME} – Serverstatus`).setDescription(`**${stateText}**`)
    .addFields(
      { name: 'Spieler', value: playerText, inline: true },
      { name: 'Map', value: status.map, inline: true },
      { name: 'Ping', value: status.ping === null ? 'nicht verfügbar' : `${status.ping} ms`, inline: true },
      { name: 'Verbindung', value: `\`${appConfig.DAYZ_SERVER_IP}:${appConfig.DAYZ_SERVER_PORT}\``, inline: false },
      { name: 'Nächster Restart', value: restart.label, inline: true },
      { name: 'Mods', value: String(modCount), inline: true },
      { name: 'Datenquelle', value: status.source, inline: true }
    ).setFooter({ text: `Letzte Prüfung: ${status.checkedAt}` }).setTimestamp();
}

export async function publishServerPanels(channel: TextChannel, db: Database, status: DayZStatus): Promise<void> {
  const info = new EmbedBuilder().setColor(0x6da900).setTitle('DeutschZ – Serverinformationen').addFields(
    { name: 'Typ', value: 'Modded DayZ PC Server', inline: true }, { name: 'Map', value: appConfig.DAYZ_MAP, inline: true },
    { name: 'Slots', value: String(appConfig.DAYZ_MAX_PLAYERS), inline: true }, { name: 'Verbindung', value: `\`${appConfig.DAYZ_SERVER_IP}:${appConfig.DAYZ_SERVER_PORT}\`` },
    { name: 'Restarts', value: `${appConfig.restartTimes.join(', ')} Uhr (${appConfig.TIMEZONE})` },
    { name: 'Website', value: `[Website im Aufbau](${appConfig.WEBSITE_URL})` }, { name: 'Discord', value: appConfig.DISCORD_INVITE_URL }
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('server:address').setLabel('Serverdaten anzeigen').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setLabel('Website öffnen').setURL(appConfig.WEBSITE_URL).setStyle(ButtonStyle.Link),
    new ButtonBuilder().setLabel('Discord-Link').setURL(appConfig.DISCORD_INVITE_URL).setStyle(ButtonStyle.Link),
    new ButtonBuilder().setCustomId('server:mods').setLabel('Modliste').setStyle(ButtonStyle.Secondary)
  );
  await upsert(channel, db, channel.guild.id, 'server-info', { embeds: [info], components: [row] });
  await upsert(channel, db, channel.guild.id, 'server-status', { embeds: [statusEmbed(status, db.listMods().length)] });
}

export async function publishModList(channel: TextChannel, db: Database): Promise<void> {
  const mods = db.listMods();
  const text = mods.map((name, index) => `${index + 1}. ${name}`).join('\n');
  await upsert(channel, db, channel.guild.id, 'mods', {
    embeds: [new EmbedBuilder().setColor(0x6da900).setTitle(`DeutschZ Modliste (${mods.length})`).setDescription(`${text}\n\n*Die Modliste kann sich während der Aufbauphase noch ändern.*`)]
  });
}

export async function publishEventList(channel: TextChannel, db: Database): Promise<void> {
  const events = db.rows<{id:number; title:string; starts_at:string; max_participants:number; reward:string}>('SELECT id,title,starts_at,max_participants,reward FROM events WHERE guild_id=? AND status=\'active\' ORDER BY starts_at LIMIT 10', [channel.guild.id]);
  const description = events.length ? events.map(e => `**#${e.id} ${e.title}** – ${e.starts_at}\nMax. ${e.max_participants} · ${e.reward}`).join('\n\n') : 'Aktuell sind keine Community-Events eingetragen.';
  await upsert(channel, db, channel.guild.id, 'events', { embeds: [new EmbedBuilder().setColor(0x6da900).setTitle('DeutschZ Events').setDescription(description)] });
}

export function storedTextChannel(guild: Guild, db: Database, name: string): TextChannel | null {
  const id = db.getConfig(guild.id, `channel:${name}`);
  const channel = id ? guild.channels.cache.get(id) : undefined;
  return channel?.isTextBased() && 'send' in channel ? channel as TextChannel : null;
}
