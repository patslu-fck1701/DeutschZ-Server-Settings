import { REST, Routes } from 'discord.js';
import { appConfig } from './config.js';
import { commandData } from './discord/commands.js';

if (!appConfig.DISCORD_TOKEN || !appConfig.DISCORD_CLIENT_ID || !appConfig.DISCORD_GUILD_ID) {
  throw new Error('Für die Registrierung fehlen DISCORD_TOKEN, DISCORD_CLIENT_ID oder DISCORD_GUILD_ID.');
}

const rest = new REST({ version: '10' }).setToken(appConfig.DISCORD_TOKEN);
try {
  await rest.put(Routes.applicationGuildCommands(appConfig.DISCORD_CLIENT_ID, appConfig.DISCORD_GUILD_ID), { body: commandData });
  console.log(`${commandData.length} Slash Commands registriert.`);
} catch (error) {
  const status = typeof error === 'object' && error !== null && 'status' in error ? String(error.status) : 'unbekannt';
  console.error(`Slash-Command-Registrierung fehlgeschlagen (HTTP ${status}). Token und App-Zuordnung im Discord Developer Portal prüfen.`);
  process.exitCode = 1;
}
