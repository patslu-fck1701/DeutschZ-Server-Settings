import { Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, Partials } from 'discord.js';
import { DateTime } from 'luxon';
import { appConfig } from './config.js';
import { Database } from './database.js';
import { logger } from './logger.js';
import { DayZStatusService } from './services/dayz-status.js';
import { nextRestart } from './services/restart.js';
import { handleButton, handleCommand, handleModal, handleSelect } from './discord/interactions.js';
import { publishServerPanels, storedTextChannel } from './discord/panels.js';
import { NotificationService } from './services/notifications.js';
import { UploadApprovalService } from './services/upload-approval.js';
import { WebhookRuntime } from './http/webhook-server.js';

interface RuntimeState { stopping: boolean; timer?: NodeJS.Timeout; webhooks?: WebhookRuntime; }
const runtimes = new WeakMap<Client, RuntimeState>();

export async function createBot(): Promise<{client: Client; db: Database}> {
  const db = await Database.open();
  const statusService = new DayZStatusService();
  const notifications = new NotificationService(db);
  const uploads = new UploadApprovalService(db);
  const interruptedUploads = uploads.recoverInterrupted();
  if (interruptedUploads) logger.error({count:interruptedUploads}, 'Unterbrochene Uploads auf UNKNOWN gesetzt; Adminprüfung erforderlich');
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildMessages];
  if (appConfig.DISCORD_GUILD_MEMBERS_INTENT) intents.push(GatewayIntentBits.GuildMembers);
  if (appConfig.DISCORD_MESSAGE_CONTENT_INTENT) intents.push(GatewayIntentBits.MessageContent);
  const client = new Client({
    intents,
    partials: [Partials.GuildMember]
  });
  const runtime: RuntimeState = { stopping: false };
  runtime.webhooks = new WebhookRuntime(db);
  runtime.webhooks.start();
  runtimes.set(client, runtime);

  client.on(Events.InteractionCreate, async interaction => {
    try {
      if (interaction.isChatInputCommand()) await handleCommand(interaction, db, statusService, notifications, uploads);
      else if (interaction.isButton()) await handleButton(interaction, db, uploads);
      else if (interaction.isStringSelectMenu()) await handleSelect(interaction, db);
      else if (interaction.isModalSubmit()) await handleModal(interaction, db, uploads);
    } catch (error) {
      logger.error({ err: error, interaction: interaction.id }, 'Interaktion fehlgeschlagen');
      const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) await interaction.followUp({ content: `Fehler: ${message}`, flags: MessageFlags.Ephemeral }).catch(() => undefined);
        else await interaction.reply({ content: `Fehler: ${message}`, flags: MessageFlags.Ephemeral }).catch(() => undefined);
      }
    }
  });

  const recentJoins: Array<{at:number;created:number}> = [];
  client.on(Events.GuildMemberAdd, async member => {
    const channel = storedTextChannel(member.guild, db, '👋・willkommen');
    if (channel) await channel.send({ embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('👋 ┃ WILLKOMMEN BEI DEUTSCHZ').setDescription(`Willkommen, <@${member.id}>.\n\n📜 Lies zuerst das Regelwerk.\n✅ Bestätige anschließend die Regeln.\n🎭 Wähle deine Rollen.\n🗺️ Prüfe die Serverinformationen.\n\n🎮 ${appConfig.DAYZ_SERVER_IP}:${appConfig.DAYZ_SERVER_PORT}\n\n☣️ DeutschZ – Überlebe nicht einfach. Hinterlasse deine Geschichte.`)] });
    const now=Date.now(); recentJoins.push({at:now,created:member.user.createdTimestamp});
    while(recentJoins.length && recentJoins[0]!.at<now-60_000) recentJoins.shift();
    if(recentJoins.length>=10){const young=recentJoins.filter(item=>now-item.created<7*24*60*60*1000).length; await notifications.raidAlert(member.guild,recentJoins.length,young).catch(error=>logger.warn({err:error},'Raid-Warnung fehlgeschlagen'));}
  });

  client.once(Events.ClientReady, ready => {
    logger.info({ user: ready.user.tag, guilds: ready.guilds.cache.size }, 'DeutschZ Bot verbunden');
    const update = async () => {
      if (runtime.stopping) return;
      uploads.expire();
      const guild = ready.guilds.cache.get(appConfig.DISCORD_GUILD_ID!);
      if (!guild) return;
      const status = await statusService.query();
      await notifications.processServerStatus(guild,status).catch(error => logger.warn({err:error}, 'Statusbenachrichtigung fehlgeschlagen'));
      if (runtime.stopping) return;
      const channel = storedTextChannel(guild, db, '🗺️・server-informationen');
      if (channel) await publishServerPanels(channel, db, status).catch(error => logger.warn({err:error}, 'Serverpanel konnte nicht aktualisiert werden'));
      const mods = storedTextChannel(guild, db, '🧩・modliste');
      if (mods) await import('./discord/panels.js').then(module => module.publishModList(mods, db)).catch(error => logger.warn({err:error}, 'Modlisten-Panel konnte nicht aktualisiert werden'));
      const events = storedTextChannel(guild, db, '🎉・event-ankündigungen');
      if (events) await import('./discord/panels.js').then(module => module.publishEventList(events, db)).catch(error => logger.warn({err:error}, 'Event-Panel konnte nicht aktualisiert werden'));
      await sendRestartReminder(guild.id, db, ready, notifications).catch(error => logger.warn({err:error}, 'Restart-Reminder fehlgeschlagen'));
    };
    const safeUpdate = () => void update().catch(error => logger.error({err:error}, 'Periodisches Update fehlgeschlagen'));
    safeUpdate();
    runtime.timer = setInterval(safeUpdate, appConfig.DAYZ_STATUS_INTERVAL_SECONDS * 1000);
    runtime.timer.unref();
  });

  return { client, db };
}

async function sendRestartReminder(guildId: string, db: Database, client: Client, notifications: NotificationService): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const restart = nextRestart(DateTime.now(), appConfig.restartTimes, appConfig.TIMEZONE);
  const minutes = Math.ceil(restart.at.diff(DateTime.now().setZone(appConfig.TIMEZONE), 'minutes').minutes);
  if (!appConfig.restartReminders.includes(minutes)) return;
  if (db.scalar<number>('SELECT COUNT(*) FROM restart_reminders WHERE restart_key=? AND minutes_before=?',[restart.key,minutes])) return;
  const title=minutes===60?'🔄 ┃ SERVERRESTART IN 60 MINUTEN':minutes===15?'⚠️ ┃ SERVERRESTART IN 15 MINUTEN':'🚨 ┃ SERVERRESTART IN 5 MINUTEN';
  const body=minutes===60?`Der nächste reguläre DeutschZ-Restart findet um ${restart.at.toFormat('HH:mm')} Uhr statt.\n\n🏕️ Bringt euch und eure Fahrzeuge in Sicherheit.\n📦 Beendet wichtige Aktionen rechtzeitig.\n💾 Plant keine größeren Bauarbeiten kurz vor dem Restart.`:minutes===15?`Der reguläre Neustart rückt näher.\n\n🚗 Fahrzeuge sichern\n📦 Inventare schließen\n🏗️ Bauarbeiten beenden\n⚔️ Laufende Gefechte berücksichtigen\n\n🕒 Restart: ${restart.at.toFormat('HH:mm')} Uhr`:`Jetzt letzte Aktionen abschließen.\n\n❌ Keine neuen Kämpfe beginnen\n❌ Keine Fahrzeuge unbeaufsichtigt lassen\n❌ Keine wichtigen Gegenstände auf dem Boden ablegen\n\n🔄 DeutschZ startet in Kürze neu.`;
  await notifications.send(guild,{type:'restart-reminder',title,body,color:minutes===5?'danger':'warning',role:'Restart-Ping',dedupeKey:`restart:${restart.key}:${minutes}`});
  db.run('INSERT INTO restart_reminders(restart_key,minutes_before,sent_at) VALUES(?,?,?)',[restart.key,minutes,new Date().toISOString()]);
}

export async function shutdown(client: Client, db: Database): Promise<void> {
  const runtime = runtimes.get(client);
  if (runtime) {
    runtime.stopping = true;
    if (runtime.timer) clearInterval(runtime.timer);
    await runtime.webhooks?.close();
  }
  client.destroy();
  await new Promise(resolve => setTimeout(resolve, 50));
  db.close();
}
