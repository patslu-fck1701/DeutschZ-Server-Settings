import {
  CategoryChannel, ChannelType, Guild, GuildChannel, PermissionFlagsBits, PermissionsBitField, TextChannel
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
  ,['DeutschZ Ehrenmitglied', '#d4af37']
] as const;

type SetupChannelType = ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildAnnouncement | ChannelType.GuildForum;
const categories: Record<string, Array<[string, SetupChannelType]>> = {
  START: [['👋・willkommen', ChannelType.GuildText], ['📜・regelwerk', ChannelType.GuildText], ['✅・verifizierung', ChannelType.GuildText], ['📢・ankündigungen', ChannelType.GuildAnnouncement], ['🎭・rollenwahl', ChannelType.GuildText]],
  SERVER: [['🟢・server-status', ChannelType.GuildText], ['👥・spieler-online', ChannelType.GuildText], ['🔄・restart-status', ChannelType.GuildText], ['🗺️・server-informationen', ChannelType.GuildText], ['🧩・modliste', ChannelType.GuildText], ['📖・einsteiger-guide', ChannelType.GuildText], ['🎯・features', ChannelType.GuildText], ['🌐・links', ChannelType.GuildText]],
  'DEUTSCHZ MODS': [['🚀・mod-releases', ChannelType.GuildAnnouncement], ['📜・mod-changelogs', ChannelType.GuildText], ['🧪・testversionen', ChannelType.GuildText], ['🐛・mod-bugreports', ChannelType.GuildForum], ['💡・mod-vorschläge', ChannelType.GuildForum], ['📘・mod-dokumentation', ChannelType.GuildForum], ['🛠️・installation-hilfe', ChannelType.GuildForum], ['📦・workshop-links', ChannelType.GuildText]],
  COMMUNITY: [['💬・allgemein', ChannelType.GuildText], ['📸・screenshots-clips', ChannelType.GuildText], ['🤝・gruppen-suche', ChannelType.GuildText], ['🏕️・handel', ChannelType.GuildText], ['💡・server-vorschläge', ChannelType.GuildText], ['📊・abstimmungen', ChannelType.GuildText]],
  EVENTS: [['🎉・event-ankündigungen', ChannelType.GuildText], ['📅・event-kalender', ChannelType.GuildText], ['✅・event-anmeldung', ChannelType.GuildText], ['🏆・event-ergebnisse', ChannelType.GuildText], ['🎬・event-medien', ChannelType.GuildText]],
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

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '');

export async function reconcileGuild(guild: Guild, db: Database): Promise<string[]> {
  await guild.roles.fetch();
  await guild.channels.fetch();
  const changes: string[] = [];
  for (const [name, color] of roleSpecs) {
    let role = guild.roles.cache.find(item => item.name === name);
    if (!role) {
      role = await guild.roles.create({ name, color, reason: 'DeutschZ idempotentes Setup' });
      changes.push(`Rolle erstellt: ${name}`);
    }
    db.setConfig(guild.id, `role:${name}`, role.id);
  }

  const ownerRole = guild.roles.cache.find(role => role.name === 'Inhaber');
  const projectRole = guild.roles.cache.find(role => role.name === 'Projektleitung');
  for (const userId of appConfig.approverUserIds) {
    const member = await guild.members.fetch(userId).catch(() => null);
    const role = userId === appConfig.OWNER_USER_ID ? ownerRole : projectRole;
    if (member && role && !member.roles.cache.has(role.id)) {
      await member.roles.add(role, userId === appConfig.OWNER_USER_ID ? 'DeutschZ Inhaber' : 'DeutschZ Hauptfreigebender').catch(() => undefined);
      changes.push(`${role.name} zugewiesen: ${userId}`);
    }
  }
  const honoraryMember=await guild.members.fetch(appConfig.HONORARY_USER_ID).catch(()=>null);
  const honoraryRoles=['DeutschZ Ehrenmitglied','Supporter']
    .map(roleName=>guild.roles.cache.find(role=>role.name===roleName))
    .filter(role=>Boolean(role));
  if(honoraryMember){
    for(const role of honoraryRoles){
      if(role&&!honoraryMember.roles.cache.has(role.id)){
        await honoraryMember.roles.add(role,'Ronny1996 (GHOST): DeutschZ Ehrenmitglied mit vollen Supporter-Rechten').catch(()=>undefined);
        changes.push(`${role.name} zugewiesen: ${appConfig.HONORARY_USER_ID}`);
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
        : isTesterChannel ? ['Inhaber','Projektleitung','Administrator','Entwickler','Mod-Tester','Bug-Hunter','DeutschZ Ehrenmitglied'] : [];
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
  if(honoraryMember&&!db.getConfig(guild.id,`honoraryNotice:v1:${appConfig.HONORARY_USER_ID}`)){
    const sent=await honoraryMember.send(`**🏅 DeutschZ-Sondermeldung für Ronny1996 (GHOST)**\n\nGlückwunsch, Ronny – laut streng vertraulicher Mama-Quelle bist du etwas ganz Besonderes. Der DeutschZ-Bot hat das jetzt offiziell gemacht: Du bist **DeutschZ Ehrenmitglied**.\n\nDu bekommst Zugang zu Testversionen und ausgewählten Feedback-Bereichen. Das klingt wichtig, ist es auch. Kritische Freigaben, Löschungen, Deployments und der ganz große rote Knopf bleiben trotzdem bei Inhaber und Projektleitung.\n\nKurz gesagt: **Ruhm ja, roter Knopf nein.** Viel Spaß mit deiner neuen Ehrenrolle. 😎`).then(()=>true).catch(()=>false);
    if(sent){db.setConfig(guild.id,`honoraryNotice:v1:${appConfig.HONORARY_USER_ID}`,new Date().toISOString());changes.push(`Ehrenmitglied informiert: ${appConfig.HONORARY_USER_ID}`);}else changes.push(`DM an Ehrenmitglied nicht möglich: ${appConfig.HONORARY_USER_ID}`);
  }
  db.setConfig(guild.id, 'setupVersion', '1');
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
