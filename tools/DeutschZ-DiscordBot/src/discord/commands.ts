import { PermissionFlagsBits, SlashCommandBuilder, SlashCommandOptionsOnlyBuilder } from 'discord.js';

const admin = PermissionFlagsBits.ManageGuild;
const mod = PermissionFlagsBits.ModerateMembers;

const textOption = <T extends SlashCommandBuilder | SlashCommandOptionsOnlyBuilder>(builder: T, name: string, description: string, required = true): T => {
  builder.addStringOption(option => option.setName(name).setDescription(description).setRequired(required));
  return builder;
};

const simpleAdmin = (name: string, description: string) => new SlashCommandBuilder().setName(name).setDescription(description).setDefaultMemberPermissions(admin);
const uploadCommand = (name:string, description:string) => textOption(textOption(simpleAdmin(name,description),'quelle','Lokaler absoluter Quellpfad'),'ziel','Erlaubter FTP-Zielpfad')
  .addStringOption(o=>o.setName('bereich').setDescription('Serverbereich').setRequired(true));

export const commandBuilders = [
  simpleAdmin('setup-deutschz', 'DeutschZ-Discordstruktur prüfen und kontrolliert einrichten'),
  simpleAdmin('setup-status', 'Stand der DeutschZ-Einrichtung anzeigen'),
  simpleAdmin('sync-all', 'Alle verwalteten DeutschZ-Panels und Live-Daten aktualisieren'),
  simpleAdmin('config-view', 'Maskierten Konfigurationsstatus anzeigen'),
  new SlashCommandBuilder().setName('bot-status').setDescription('Öffentlichen Betriebsstatus des Bots anzeigen'),
  simpleAdmin('status-refresh', 'DayZ-Status sofort aktualisieren'),
  uploadCommand('upload','Sichere FTP-Upload-Anfrage erstellen'),
  uploadCommand('deploy','Sichere Deployment-Anfrage erstellen'),
  uploadCommand('push-settings','Sichere Settings-Upload-Anfrage erstellen'),
  uploadCommand('push-mod','Sichere Mod-Upload-Anfrage erstellen'),
  uploadCommand('push-file','Sichere Datei-Upload-Anfrage erstellen'),
  simpleAdmin('notification-status', 'Persistenten Benachrichtigungsstatus anzeigen'),
  textOption(textOption(simpleAdmin('announce', 'DeutschZ-Information veröffentlichen'), 'titel', 'Überschrift'), 'text', 'Kurze Nachricht')
    .addStringOption(o => o.setName('link').setDescription('Optionaler weiterführender Link').setRequired(false)),
  textOption(textOption(textOption(simpleAdmin('maintenance-announce', 'Geplante Wartung ankündigen'), 'datum', 'Datum, z. B. 18.07.2026'), 'beginn', 'Beginn, z. B. 20:00 Uhr'), 'dauer', 'Voraussichtliche Dauer')
    .addStringOption(o => o.setName('grund').setDescription('Grund der Wartung').setRequired(true)),
  simpleAdmin('maintenance-start', 'Beginn der geplanten Wartung melden'),
  simpleAdmin('maintenance-complete', 'Abschluss der Wartung melden'),
  textOption(simpleAdmin('notify-kothz', 'KotHZ-Statusmeldung senden'), 'status', 'announce, active, progress oder won')
    .addStringOption(o => o.setName('standort').setDescription('Eventstandort').setRequired(false))
    .addIntegerOption(o => o.setName('fortschritt').setDescription('Fortschritt 0 bis 100').setMinValue(0).setMaxValue(100).setRequired(false))
    .addStringOption(o => o.setName('gewinner').setDescription('Spieler oder Gruppe').setRequired(false)),
  textOption(textOption(simpleAdmin('giveaway-result', 'Gewinnspiel-Ergebnis veröffentlichen'), 'gewinner', 'Gewinner oder Mention'), 'gewinn', 'Gewinn')
    .addIntegerOption(o => o.setName('teilnehmer').setDescription('Teilnehmerzahl').setMinValue(1).setRequired(false)),
  textOption(textOption(textOption(simpleAdmin('mod-release', 'Eigenen DeutschZ-Mod-Release veröffentlichen'), 'mod', 'Produktname'), 'version', 'Versionsnummer'), 'workshop', 'Workshop-Link')
    .addStringOption(o => o.setName('status').setDescription('Stable, Beta oder Test').setRequired(false))
    .addStringOption(o => o.setName('changelog').setDescription('Optionaler Changelog-Link').setRequired(false)),
  textOption(textOption(textOption(simpleAdmin('mod-changelog', 'Changelog eines DeutschZ-Mods archivieren'), 'mod', 'Produktname'), 'version', 'Versionsnummer'), 'text', 'Changelogtext'),
  textOption(simpleAdmin('raid-mode', 'Raid-Modusstatus kontrolliert setzen'), 'status', 'on oder off'),
  simpleAdmin('server-panel', 'Serverinfo- und Statuspanel veröffentlichen oder reparieren'),
  simpleAdmin('verify-panel', 'Verifizierungs-Panel veröffentlichen oder reparieren'),
  simpleAdmin('roles-panel', 'Rollenwahl-Panel veröffentlichen oder reparieren'),
  simpleAdmin('ticket-panel', 'Ticket-Panel veröffentlichen oder reparieren'),
  simpleAdmin('event-panel', 'Eventübersicht veröffentlichen oder reparieren'),
  new SlashCommandBuilder().setName('mods').setDescription('Aktuelle DeutschZ-Modliste anzeigen'),
  textOption(simpleAdmin('mods-add', 'Mod zur Liste hinzufügen'), 'name', 'Exakte Modbezeichnung'),
  textOption(simpleAdmin('mods-remove', 'Mod aus der Liste entfernen'), 'name', 'Exakte Modbezeichnung'),
  textOption(textOption(simpleAdmin('mods-edit', 'Modbezeichnung ändern'), 'alt', 'Bisherige Bezeichnung'), 'neu', 'Neue Bezeichnung'),
  simpleAdmin('mods-refresh', 'Öffentliches Modlisten-Panel aktualisieren'),
  new SlashCommandBuilder().setName('restart-next').setDescription('Nächsten Serverrestart anzeigen'),
  simpleAdmin('restart-test', 'Restart-Berechnung testen'),
  simpleAdmin('permissions-check', 'Botberechtigungen und Rollenhierarchie prüfen'),
  simpleAdmin('database-status', 'Persistenzstatus anzeigen'),
  simpleAdmin('backup-create', 'Sofort ein Datenbankbackup erstellen'),
  new SlashCommandBuilder().setName('github-status').setDescription('Erreichbarkeit der DeutschZ-Repositories prüfen'),
  new SlashCommandBuilder().setName('github-latest').setDescription('Neueste öffentliche GitHub-Commits anzeigen'),
  new SlashCommandBuilder().setName('github-links').setDescription('Links zu den DeutschZ-Repositories anzeigen'),
  new SlashCommandBuilder().setName('suggest').setDescription('Einen Community-Vorschlag einreichen'),
  textOption(textOption(simpleAdmin('event-create', 'Community-Event erstellen'), 'titel', 'Eventtitel'), 'start', 'ISO-Datum oder YYYY-MM-DD HH:mm')
    .addIntegerOption(o => o.setName('max').setDescription('Maximale Teilnehmer').setMinValue(1).setRequired(true))
    .addStringOption(o => o.setName('beschreibung').setDescription('Beschreibung').setRequired(true))
    .addStringOption(o => o.setName('belohnung').setDescription('Belohnung').setRequired(false)),
  simpleAdmin('event-list', 'Gespeicherte Events anzeigen'),
  simpleAdmin('event-edit', 'Event bearbeiten').addIntegerOption(o => o.setName('id').setDescription('Event-ID').setRequired(true)).addStringOption(o => o.setName('titel').setDescription('Neuer Titel').setRequired(true)),
  simpleAdmin('event-cancel', 'Event absagen').addIntegerOption(o => o.setName('id').setDescription('Event-ID').setRequired(true)),
  simpleAdmin('event-remind', 'Event-Erinnerung senden').addIntegerOption(o => o.setName('id').setDescription('Event-ID').setRequired(true)),
  textOption(new SlashCommandBuilder().setName('warn').setDescription('Nutzer verwarnen').setDefaultMemberPermissions(mod).addUserOption(o => o.setName('nutzer').setDescription('Nutzer').setRequired(true)), 'grund', 'Begründung'),
  new SlashCommandBuilder().setName('warnings').setDescription('Verwarnungen eines Nutzers anzeigen').setDefaultMemberPermissions(mod).addUserOption(o => o.setName('nutzer').setDescription('Nutzer').setRequired(true)),
  new SlashCommandBuilder().setName('warn-remove').setDescription('Verwarnung entfernen').setDefaultMemberPermissions(mod).addIntegerOption(o => o.setName('fall').setDescription('Fallnummer').setRequired(true)),
  textOption(new SlashCommandBuilder().setName('timeout').setDescription('Nutzer temporär sperren').setDefaultMemberPermissions(mod).addUserOption(o => o.setName('nutzer').setDescription('Nutzer').setRequired(true)).addIntegerOption(o => o.setName('minuten').setDescription('Dauer in Minuten').setRequired(true).setMinValue(1).setMaxValue(40320)), 'grund', 'Begründung'),
  new SlashCommandBuilder().setName('untimeout').setDescription('Timeout aufheben').setDefaultMemberPermissions(mod).addUserOption(o => o.setName('nutzer').setDescription('Nutzer').setRequired(true)),
  textOption(new SlashCommandBuilder().setName('kick').setDescription('Nutzer entfernen').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(o => o.setName('nutzer').setDescription('Nutzer').setRequired(true)), 'grund', 'Begründung'),
  textOption(new SlashCommandBuilder().setName('ban').setDescription('Nutzer bannen').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(o => o.setName('nutzer').setDescription('Nutzer').setRequired(true)), 'grund', 'Begründung'),
  new SlashCommandBuilder().setName('unban').setDescription('Ban aufheben').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption(o => o.setName('nutzer_id').setDescription('Discord User-ID').setRequired(true)),
  new SlashCommandBuilder().setName('clear').setDescription('Nachrichten löschen').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(o => o.setName('anzahl').setDescription('1 bis 100').setRequired(true).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('slowmode').setDescription('Slowmode setzen').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels).addIntegerOption(o => o.setName('sekunden').setDescription('0 bis 21600').setRequired(true).setMinValue(0).setMaxValue(21600)),
  new SlashCommandBuilder().setName('nickname-reset').setDescription('Nickname zurücksetzen').setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames).addUserOption(o => o.setName('nutzer').setDescription('Nutzer').setRequired(true)),
  textOption(new SlashCommandBuilder().setName('modnote').setDescription('Interne Moderationsnotiz').setDefaultMemberPermissions(mod).addUserOption(o => o.setName('nutzer').setDescription('Nutzer').setRequired(true)), 'notiz', 'Interne Notiz')
];

export const commandData = commandBuilders.map(command => command.toJSON());
