import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, CategoryChannel, ChannelType, ForumChannel, Guild, GuildChannel, PermissionFlagsBits, PermissionsBitField, TextChannel
} from 'discord.js';
import type { Database } from '../database.js';
import { appConfig } from '../config.js';

const roleSpecs = [
  ['Inhaber', '#b30000'], ['Projektleitung', '#d92626'], ['Administrator', '#e74c3c'],
  ['Moderator', '#e67e22'], ['Supporter', '#3498db'], ['Event-Team', '#9b59b6'],
  ['Content Creator', '#e91e63'], ['Partner', '#1abc9c'], ['Booster', '#f47fff'],
  ['Verifiziert', '#7fbf00'], ['Survivor', '#95a5a6'], ['PvP', '#c0392b'], ['PvE', '#27ae60'],
  ['Solo', '#7f8c8d'], ['Gruppe sucht Spieler', '#16a085'], ['Event-Ping', '#8e44ad'],
  ['Restart-Ping', '#f39c12'], ['Update-Ping', '#2980b9'], ['Wartungs-Ping', '#f1c40f'],
  ['Serverstatus-Ping', '#e74c3c'], ['Giveaway-Ping', '#9b59b6'], ['Community-Ping', '#3498db'],
  ['Testserver-Ping', '#95a5a6'], ['Content-Ping', '#e91e63'], ['KotHZ-Ping', '#8e44ad'],
  ['Entwickler', '#00a8ff'], ['Mod-Tester', '#9b59b6'], ['Bug-Hunter', '#e67e22'],
  ['Dokumentation', '#3498db'], ['Release-Team', '#16a085'], ['Media-Team', '#e91e63']
  ,['Spezial Ehrenmitglied', '#d4af37'], ['DeutschZ Unterstützer', '#68a800']
] as const;

type SetupChannelType = ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildAnnouncement | ChannelType.GuildForum;
const categories: Record<string, Array<[string, SetupChannelType]>> = {
  START: [['👋・willkommen', ChannelType.GuildText], ['📜・regelwerk', ChannelType.GuildText], ['✅・verifizierung', ChannelType.GuildText], ['📢・ankündigungen', ChannelType.GuildAnnouncement], ['🎭・rollenwahl', ChannelType.GuildText]],
  SERVER: [['🟢・server-status', ChannelType.GuildText], ['👥・spieler-online', ChannelType.GuildText], ['🔄・restart-status', ChannelType.GuildText], ['🗺️・server-informationen', ChannelType.GuildText], ['🧩・modliste', ChannelType.GuildText], ['📖・einsteiger-guide', ChannelType.GuildText], ['🎯・features', ChannelType.GuildText], ['🌐・links', ChannelType.GuildText]],
  'DEUTSCHZ MODS': [['🚀・mod-releases', ChannelType.GuildAnnouncement], ['📜・mod-changelogs', ChannelType.GuildText], ['🧪・testversionen', ChannelType.GuildText], ['🐛・mod-bugreports', ChannelType.GuildForum], ['💡・mod-vorschläge', ChannelType.GuildForum], ['📘・mod-dokumentation', ChannelType.GuildForum], ['🛠️・installation-hilfe', ChannelType.GuildForum], ['📦・workshop-links', ChannelType.GuildText]],
  COMMUNITY: [['💬・allgemein', ChannelType.GuildText], ['📸・screenshots-clips', ChannelType.GuildText], ['🤝・gruppen-suche', ChannelType.GuildText], ['🏕️・handel', ChannelType.GuildText], ['💡・server-vorschläge', ChannelType.GuildText], ['📊・abstimmungen', ChannelType.GuildText]],
  EVENTS: [['🎉・event-ankündigungen', ChannelType.GuildText], ['📅・event-kalender', ChannelType.GuildText], ['✅・event-anmeldung', ChannelType.GuildText], ['🏆・event-ergebnisse', ChannelType.GuildText], ['🎬・event-medien', ChannelType.GuildText]],
  SCHILDWALL: [['🛡️・schildwall', ChannelType.GuildText], ['👥・team-vorstellung', ChannelType.GuildText], ['🛒・markt', ChannelType.GuildText], ['🎵・deutschz-musik', ChannelType.GuildText], ['❤️・unterstützen', ChannelType.GuildText]],
  SUPPORT: [['📌・support-informationen', ChannelType.GuildText], ['🎫・ticket-erstellen', ChannelType.GuildText]],
  VOICE: [['🔊・Lobby', ChannelType.GuildVoice], ['➕・Gruppe erstellen', ChannelType.GuildVoice], ['🎮・Gruppe 1', ChannelType.GuildVoice], ['🎮・Gruppe 2', ChannelType.GuildVoice], ['🎯・Event Voice', ChannelType.GuildVoice], ['💤・AFK', ChannelType.GuildVoice]],
  'TEAM INTERN': [['💬・team-chat', ChannelType.GuildText], ['📌・team-ankündigungen', ChannelType.GuildText], ['📝・team-aufgaben', ChannelType.GuildText], ['🎯・event-planung', ChannelType.GuildText], ['📣・content-planung', ChannelType.GuildText]],
  'MOD DEVELOPMENT': [['💻・dev-chat', ChannelType.GuildText], ['🧠・mod-roadmap', ChannelType.GuildForum], ['🐛・dev-bugtracker', ChannelType.GuildForum], ['🧪・build-tests', ChannelType.GuildText], ['📦・release-vorbereitung', ChannelType.GuildText], ['🔗・github-logs', ChannelType.GuildText], ['📋・build-logs', ChannelType.GuildText], ['🔐・interne-dokumentation', ChannelType.GuildForum]],
  MODERATION: [['📋・moderations-logs', ChannelType.GuildText], ['🎫・ticket-logs', ChannelType.GuildText], ['🚨・spieler-reports', ChannelType.GuildText], ['🔨・ban-einsprüche', ChannelType.GuildText], ['📂・fall-archiv', ChannelType.GuildText]],
  SERVERMANAGEMENT: [['🤖・bot-logs', ChannelType.GuildText], ['🟢・server-logs', ChannelType.GuildText], ['🔄・restart-logs', ChannelType.GuildText], ['📦・backup-logs', ChannelType.GuildText], ['🔧・server-management', ChannelType.GuildText]]
};

const approverMessage = `**Erklärung für die Hauptfreigeber**

Ihr werdet im DeutschZ-Discord als Hauptfreigeber hinterlegt. Das bedeutet: Ihr gehört zu einem sehr kleinen Kreis, der besonders kritische Änderungen am Discord bestätigen darf. Dazu zählen größere Änderungen an der Kanalstruktur, Löschen von Kanälen oder Kategorien, Änderungen an wichtigen Rollen, Setup- und Reparaturvorgänge des Bots, größere Berechtigungsänderungen, Wiederherstellung von Backups sowie Aktivierung von Notfall- oder Raid-Funktionen.

Der Bot prüft eure Berechtigung ausschließlich über eure feste Discord-ID. Anzeigename, Benutzername und Pronomen spielen dabei keine Rolle.

**Was das konkret bedeutet**
Ihr müsst den Discord nicht ständig verwalten. Ihr seid eine Freigabeinstanz für wichtige Änderungen. Normale Funktionen wie Serverstatus, Spielerzahl, Restarts, Tickets, Verifizierung, Rollenwahl, Event-Erinnerungen und Info-Nachrichten laufen automatisch.

Bei kritischen Vorgängen kann der Bot anzeigen: geplante Änderung, betroffene Kanäle/Rollen, genaue Aktion, Auswirkungen und Auslöser. Danach könnt ihr bestätigen oder ablehnen.

**Wichtig**
Bestätigt nichts, das ihr nicht versteht. Prüft besonders Löschen von Kanälen/Rollen, große Berechtigungsänderungen, Neustrukturierungen, Massenaktionen, Backup-Wiederherstellung und Datenbank-/Setup-Reset. Bei Unsicherheit zuerst ablehnen und intern besprechen.

**Eure Verantwortung**
Schützt euren Account mit 2FA, öffnet keine unbekannten Links/Dateien, gebt niemals Token oder Zugangsdaten weiter, meldet verdächtige Anfragen, bestätigt nur abgesprochene Änderungen und teilt euren Account nicht.

Ihr müsst keinen Code schreiben, keine Botdateien bearbeiten, keine Serverkonfiguration verstehen, nicht dauerhaft online sein und nicht jedes Ticket oder jede Moderationsentscheidung übernehmen. Ihr seid eine zusätzliche Sicherheits- und Freigabeinstanz.`;

const responsibilityMessage = `🚨 **PFLICHTINFORMATION – BITTE VOLLSTÄNDIG LESEN**

Diese Information betrifft Sicherheit und Stabilität des DeutschZ-Servers. Bitte bestätigt sie erst, wenn ihr den Ablauf verstanden habt.

**Kritische Änderungen und FTP-Uploads**
Ein Upload startet niemals direkt durch einen Slash-Command. Der Bot erstellt zuerst eine Request-ID, prüft Quelle, Ziel, Dateityp, Größe und SHA-256-Hash und zeigt eine Freigabeanfrage. Vor dem Transfer werden Berechtigung, Ablaufzeit, Hash und Ziel erneut geprüft. Kritische Uploads verlangen zusätzlich einen einmaligen Bestätigungssatz. Der Transfer verwendet temporäre Remotedateien, Größenprüfung, Backup und Rollback.

Standardmäßig gilt das Vier-Augen-Prinzip. Nur der fest hinterlegte Inhaber fck1701 kann seinen eigenen Auftrag ausdrücklich selbst freigeben. Diese Ausnahme wird im Audit protokolliert. Passwörter, Tokens und private Schlüssel dürfen niemals übertragen, gepostet oder bestätigt werden.

**Eure Verantwortung**
Prüft Request-ID, Quelle, Ziel, Dateianzahl, Größe und Hash. Bestätigt nichts Unverständliches oder Unabgesprochenes. Meldet verdächtige Anfragen sofort. Spezial-Ehrenmitglieder und Supporter beobachten, testen und geben Feedback, besitzen aber keine FTP-, Lösch- oder Deploymentfreigabe.

Bitte klickt erst nach vollständigem Lesen auf **GELESEN UND VERSTANDEN**. Nutzer-ID und Zeitpunkt werden als Sicherheitsnachweis gespeichert.`;

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '');

function channelPurpose(category: string, name: string): string {
  if (name.includes('logs')) return 'Dieser geschützte Kanal dokumentiert ausschließlich echte, vom Bot oder Team ausgelöste Vorgänge. Keine erfundenen Einträge und keine Zugangsdaten.';
  if (name.includes('markt')) return 'Hier findet ihr den read-only aus den aktuellen Expansion-Settings importierten DeutschZ-Markt. Nutzt `/markt`, um Kategorien, Artikel, Preisbereiche und Händlerzuordnungen zu prüfen.';
  if (name.includes('musik')) return 'Hier geht es um die freigegebene DeutschZ-Musik. Mit `/musik liste` seht ihr die Titel; `/musik play` startet sie in eurem aktuellen Sprachkanal.';
  if (name.includes('unterstützen')) return `Freiwillige Unterstützung hilft bei Serverkosten, Events, Mods, Grafik und Musik. Sie bringt keine Gameplay- oder Adminvorteile. ${appConfig.DONATION_URL}`;
  if (name.includes('schildwall')) return 'Der DeutschZ-Schildwall stellt Projektleitung, Hauptverantwortliche und besondere Unterstützer transparent vor.';
  if (name.includes('team-vorstellung')) return 'Offizielle Vorstellung des DeutschZ-Teams mit klaren Verantwortlichkeiten und besonderem Dank an Halftan und DevilMagic.';
  return `Dieser Kanal gehört zum Bereich **${category}**. Hier werden ausschließlich passende Informationen, Fragen und Aktualisierungen zu **${name}** gesammelt.`;
}

async function ensurePinnedChannelInfo(channel: GuildChannel, category: string, name: string): Promise<boolean> {
  const marker = `DEUTSCHZ KANALINFO · ${category} · ${name}`;
  if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) {
    const textChannel = channel as TextChannel;
    const pinned = await textChannel.messages.fetchPinned().catch(() => null);
    if (pinned?.some(message => message.content.includes(marker))) return false;
    const message = await textChannel.send(`**${marker}**\n\n${channelPurpose(category, name)}\n\nBitte beachtet die angepinnten Informationen und haltet Beiträge beim Thema.`);
    await message.pin('DeutschZ: Jeder Kanal erhält eine eindeutige angepinnte Zweckinformation.');
    return true;
  }
  if (channel.type === ChannelType.GuildForum) {
    const forumChannel = channel as ForumChannel;
    const existing = await forumChannel.threads.fetchActive().catch(() => null);
    if (existing?.threads.some(thread => thread.name === 'DeutschZ Kanalinfo')) return false;
    const thread = await forumChannel.threads.create({ name: 'DeutschZ Kanalinfo', message: { content: `**${marker}**\n\n${channelPurpose(category, name)}\n\nErstellt neue Beiträge bitte mit verständlichem Titel und vollständigen Angaben.` }, reason: 'DeutschZ Forum-Grundinformation' });
    const starter = await thread.fetchStarterMessage().catch(() => null);
    await starter?.pin('DeutschZ Forum-Grundinformation').catch(() => undefined);
    return true;
  }
  return false;
}

export async function reconcileGuild(guild: Guild, db: Database): Promise<string[]> {
  await guild.roles.fetch();
  await guild.channels.fetch();
  const changes: string[] = [];
  const legacyHonorary = guild.roles.cache.find(item => item.name === 'DeutschZ Ehrenmitglied');
  if (legacyHonorary && !guild.roles.cache.some(item => item.name === 'Spezial Ehrenmitglied')) {
    await legacyHonorary.setName('Spezial Ehrenmitglied', 'DeutschZ eindeutige Ehrenrollenbezeichnung');
    changes.push('Rolle migriert: DeutschZ Ehrenmitglied → Spezial Ehrenmitglied');
  }
  for (const [name, color] of roleSpecs) {
    let role = guild.roles.cache.find(item => item.name === name);
    if (!role) {
      role = await guild.roles.create({ name, color, reason: 'DeutschZ idempotentes Setup' });
      changes.push(`Rolle erstellt: ${name}`);
    }
    db.setConfig(guild.id, `role:${name}`, role.id);
  }

  const responsibilityRoles: Record<string,string[]> = {
    [appConfig.OWNER_USER_ID]: ['Inhaber','Projektleitung','Administrator'],
    '769953999163621397': ['Projektleitung','Administrator'],
    '526160792538710016': ['Administrator']
  };
  for (const userId of appConfig.approverUserIds) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    for (const roleName of responsibilityRoles[userId] ?? []) {
      const role = guild.roles.cache.find(item => item.name === roleName);
      if (role && !member.roles.cache.has(role.id)) {
        await member.roles.add(role, `DeutschZ Verantwortung per Discord-User-ID ${userId}`).catch(() => undefined);
        changes.push(`${role.name} zugewiesen: ${userId}`);
      }
    }
  }
  const honoraryRoles=['Spezial Ehrenmitglied','Supporter']
    .map(roleName=>guild.roles.cache.find(role=>role.name===roleName))
    .filter(role=>Boolean(role));
  for (const honoraryUserId of [appConfig.HONORARY_USER_ID, appConfig.SECOND_HONORARY_USER_ID]) {
    const honoraryMember=await guild.members.fetch(honoraryUserId).catch(()=>null);
    if(honoraryMember){
      for(const role of honoraryRoles){
        if(role&&!honoraryMember.roles.cache.has(role.id)){
          await honoraryMember.roles.add(role,'DeutschZ Spezial-Ehrenmitglied mit vollen Supporter-Rechten, ohne kritische Freigaberechte').catch(()=>undefined);
          changes.push(`${role.name} zugewiesen: ${honoraryUserId}`);
        }
      }
    }
  }

  let categoryPosition = 0;
  for (const [categoryName, channels] of Object.entries(categories)) {
    let category = guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === categoryName);
    if (!category) {
      category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
      changes.push(`Kategorie erstellt: ${categoryName}`);
    }
    await (category as CategoryChannel).setPosition(categoryPosition++).catch(() => undefined);
    let channelPosition = 0;
    for (const [name, type] of channels) {
      const protectedCategoryRoles: Record<string,string[]> = {
        'TEAM INTERN': ['Inhaber','Projektleitung','Administrator','Moderator','Supporter','Event-Team','Content Creator','Entwickler','Mod-Tester','Bug-Hunter','Dokumentation','Release-Team'],
        'MODERATION': ['Inhaber','Projektleitung','Administrator','Moderator','Supporter'],
        'SERVERMANAGEMENT': ['Inhaber','Projektleitung','Administrator','Entwickler'],
        'MOD DEVELOPMENT': ['Inhaber','Projektleitung','Administrator','Entwickler','Mod-Tester','Bug-Hunter','Dokumentation','Release-Team']
      };
      const isTeam = Object.hasOwn(protectedCategoryRoles,categoryName);
      const isTesterChannel = categoryName === 'DEUTSCHZ MODS' && name === '🧪・testversionen';
      const isReleaseChannel = categoryName === 'DEUTSCHZ MODS' && ['🚀・mod-releases','📜・mod-changelogs'].includes(name);
      const visibleRoleNames = isTeam
        ? (protectedCategoryRoles[categoryName] ?? [])
        : isTesterChannel ? ['Inhaber','Projektleitung','Administrator','Entwickler','Mod-Tester','Bug-Hunter','Spezial Ehrenmitglied'] : [];
      const visibleRoleIds = visibleRoleNames.map(roleName => guild.roles.cache.find(role => role.name === roleName)?.id).filter((id): id is string => Boolean(id));
      const releaseRoleIds = ['Inhaber','Projektleitung','Release-Team'].map(roleName => guild.roles.cache.find(role => role.name === roleName)?.id).filter((id): id is string => Boolean(id));
      let channel = guild.channels.cache.find(item => item.parentId === category!.id && normalize(item.name) === normalize(name));
      if (!channel) {
        channel = guild.channels.cache.find(item => !item.parentId && item.type === type && normalize(item.name) === normalize(name));
        if (channel) {
          await (channel as GuildChannel).setParent(category.id, { lockPermissions: false });
          changes.push(`Geschützten Community-Kanal übernommen: ${categoryName}/${name}`);
        }
      }
      if (!channel) {
        channel = await guild.channels.create({
          name, type, parent: category.id,
          permissionOverwrites: isTeam || isTesterChannel ? [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            ...visibleRoleIds.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.SendMessagesInThreads] }))
          ] : isReleaseChannel ? [
            { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
            ...releaseRoleIds.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))
          ] : undefined
        });
        changes.push(`Kanal erstellt: ${categoryName}/${name}`);
      }
      if (isTeam || isTesterChannel) await (channel as GuildChannel).permissionOverwrites.set([
        {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
        ...visibleRoleIds.map(id=>({id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.CreatePublicThreads,PermissionFlagsBits.SendMessagesInThreads]}))
      ],'DeutschZ geschützter Bereich').catch(()=>undefined);
      else if (isReleaseChannel) await (channel as GuildChannel).permissionOverwrites.set([
        {id:guild.roles.everyone.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory],deny:[PermissionFlagsBits.SendMessages]},
        ...releaseRoleIds.map(id=>({id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}))
      ],'DeutschZ Releasebereich').catch(()=>undefined);
      await (channel as GuildChannel).setPosition(channelPosition++).catch(() => undefined);
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement || channel.type === ChannelType.GuildForum) {
        await channel.permissionOverwrites.edit(guild.roles.everyone.id, { MentionEveryone: false }).catch(() => undefined);
        for (const roleName of ['Inhaber','Projektleitung']) {
          const mentionRole = guild.roles.cache.find(role => role.name === roleName);
          if (mentionRole) await channel.permissionOverwrites.edit(mentionRole.id, { MentionEveryone: true }).catch(() => undefined);
        }
      }
      db.setConfig(guild.id, `channel:${name}`, channel.id);
      if (await ensurePinnedChannelInfo(channel as GuildChannel, categoryName, name).catch(() => false)) changes.push(`Kanalinfo angepinnt: ${categoryName}/${name}`);
    }
  }
  for (const userId of appConfig.approverUserIds) {
    if (db.getConfig(guild.id, `approverNotice:v1:${userId}`)) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) { changes.push(`Hauptfreigeber nicht im Guild gefunden: ${userId}`); continue; }
    const sent = await member.send(approverMessage).then(() => true).catch(() => false);
    if (sent) {
      db.setConfig(guild.id, `approverNotice:v1:${userId}`, new Date().toISOString());
      changes.push(`Hauptfreigeber informiert: ${userId}`);
    } else changes.push(`DM an Hauptfreigeber nicht möglich: ${userId}`);
  }
  const honoraryNotices: Record<string,string> = {
    [appConfig.HONORARY_USER_ID]: '**🏅 DeutschZ Spezial-Ehrenmitglied & Supporter**\n\nRonny, du unterstützt DeutschZ künftig mit Spielerhilfe, Tests und ehrlichem Feedback. Du wirst regelmäßig in wichtige Aufgaben und Entscheidungen eingebunden. Kritische Upload-, Deployment-, Rollen- und Löschfreigaben bleiben bewusst bei Inhaber und Hauptfreigebern.',
    [appConfig.SECOND_HONORARY_USER_ID]: '**🏅 DeutschZ Spezial-Ehrenmitglied & Supporter**\n\nTschuby, du unterstützt DeutschZ künftig mit Spielerhilfe, Tests und ehrlichem Feedback. Du wirst regelmäßig in wichtige Aufgaben und Entscheidungen eingebunden. Kritische Upload-, Deployment-, Rollen- und Löschfreigaben bleiben bewusst bei Inhaber und Hauptfreigebern.'
  };
  for (const [userId, notice] of Object.entries(honoraryNotices)) {
    if (db.getConfig(guild.id, `honoraryNotice:v2:${userId}`)) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) { changes.push(`Spezial-Ehrenmitglied nicht im Guild gefunden: ${userId}`); continue; }
    const sent = await member.send(notice).then(() => true).catch(() => false);
    if (sent) {
      db.setConfig(guild.id, `honoraryNotice:v2:${userId}`, new Date().toISOString());
      changes.push(`Spezial-Ehrenmitglied informiert: ${userId}`);
    } else changes.push(`DM an Spezial-Ehrenmitglied nicht möglich: ${userId}`);
  }

  const teamNow = new Date().toISOString();
  db.run(`INSERT INTO teams(guild_id,team_key,display_name,description,active,created_at,updated_at)
          VALUES(?,?,?,?,1,?,?) ON CONFLICT(guild_id,team_key) DO UPDATE SET
          display_name=excluded.display_name,description=excluded.description,active=1,updated_at=excluded.updated_at`,
    [guild.id, 'schildwall', 'DeutschZ Schildwall', 'Offizielle Verantwortliche, Hauptfreigeber und Spezial-Ehrenmitglieder.', teamNow, teamNow]);
  const teamId = db.scalar<number>('SELECT id FROM teams WHERE guild_id=? AND team_key=?', [guild.id, 'schildwall']);
  const teamMembers: Array<[string,string,Record<string,boolean>]> = [
    [appConfig.OWNER_USER_ID, 'Inhaber / Projektleitung', { ownerOverride: true, ftpApproval: true, criticalApproval: true }],
    ['769953999163621397', 'Mitgründer / Hauptfreigeber', { ftpApproval: true, criticalApproval: true }],
    ['526160792538710016', 'Administration / Hauptfreigeber', { ftpApproval: true, criticalApproval: true }],
    [appConfig.HONORARY_USER_ID, 'Spezial-Ehrenmitglied / Supporter', { support: true, testing: true, feedback: true }],
    [appConfig.SECOND_HONORARY_USER_ID, 'Spezial-Ehrenmitglied / Supporter', { support: true, testing: true, feedback: true }]
  ];
  if (teamId !== undefined) {
    for (const [userId, teamRole, permissions] of teamMembers) {
      db.run(`INSERT INTO team_members(team_id,user_id,team_role,permissions_json,active,created_at,updated_at)
              VALUES(?,?,?,?,1,?,?) ON CONFLICT(team_id,user_id) DO UPDATE SET
              team_role=excluded.team_role,permissions_json=excluded.permissions_json,active=1,updated_at=excluded.updated_at`,
        [teamId, userId, teamRole, JSON.stringify(permissions), teamNow, teamNow]);
    }
  }

  const acknowledgementRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('responsibility:ack:v2').setLabel('GELESEN UND VERSTANDEN').setStyle(ButtonStyle.Success)
  );
  const responsibleUsers = [...new Set([...appConfig.approverUserIds, appConfig.HONORARY_USER_ID, appConfig.SECOND_HONORARY_USER_ID])];
  for (const userId of responsibleUsers) {
    if (db.getConfig(guild.id, `responsibilityNotice:v2:${userId}`)) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) { changes.push(`Pflichtinformation: Nutzer nicht im Guild gefunden: ${userId}`); continue; }
    const sent = await member.send({ content: responsibilityMessage, components: [acknowledgementRow] }).then(() => true).catch(() => false);
    if (sent) {
      db.setConfig(guild.id, `responsibilityNotice:v2:${userId}`, new Date().toISOString());
      changes.push(`Pflichtinformation mit Bestätigung gesendet: ${userId}`);
    } else changes.push(`Pflichtinformation per DM nicht zustellbar: ${userId}`);
  }
  db.setConfig(guild.id, 'setupVersion', '2');
  return changes;
}

export { categories as deutschzCategorySpecs, roleSpecs as deutschzRoleSpecs };

export function permissionReport(guild: Guild): string[] {
  const me = guild.members.me;
  if (!me) return ['Botmitglied konnte nicht geladen werden.'];
  const required = [
    PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory
  ];
  return required.map(flag => `${new PermissionsBitField(flag).toArray()[0]}: ${me.permissions.has(flag) ? 'JA' : 'NEIN'}`);
}

export function textChannelByStoredKey(guild: Guild, db: Database, key: string): TextChannel | null {
  const id = db.getConfig(guild.id, key);
  const channel = id ? guild.channels.cache.get(id) : undefined;
  return channel?.isTextBased() && channel.type === ChannelType.GuildText ? channel : null;
}
