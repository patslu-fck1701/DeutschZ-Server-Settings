import { appConfig, safeConfigStatus } from './config.js';
import { createBot, shutdown } from './bot.js';
import { logger } from './logger.js';

logger.info({ config: safeConfigStatus() }, 'DeutschZ Bot startet');
if (!appConfig.discordReady) {
  logger.error('Discord-Verbindung blockiert: DISCORD_TOKEN, DISCORD_CLIENT_ID oder DISCORD_GUILD_ID fehlt.');
  process.exitCode = 2;
} else {
  const { client, db } = await createBot();
  const stop = async (signal: string) => {
    logger.info({ signal }, 'Kontrollierter Stopp');
    await shutdown(client, db);
    process.exit(0);
  };
  process.once('SIGINT', () => void stop('SIGINT'));
  process.once('SIGTERM', () => void stop('SIGTERM'));
  await client.login(appConfig.DISCORD_TOKEN);
}
