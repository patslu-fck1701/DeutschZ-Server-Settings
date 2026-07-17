import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import { appConfig } from './config.js';

fs.mkdirSync(appConfig.LOG_DIRECTORY, { recursive: true });

export const logger = pino({
  level: appConfig.LOG_LEVEL,
  redact: {
    paths: [
      'token', '*.token', 'password', '*.password', 'secret', '*.secret',
      'authorization', '*.authorization', 'DISCORD_TOKEN', 'GITHUB_TOKEN',
      'FTP_PASSWORD', 'process.env'
      , 'WHATSAPP_ACCESS_TOKEN', '*.WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_APP_SECRET', '*.WHATSAPP_APP_SECRET'
      , 'WHATSAPP_VERIFY_TOKEN', '*.WHATSAPP_VERIFY_TOKEN', 'WEBSITE_LEAD_WEBHOOK_SECRET', '*.WEBSITE_LEAD_WEBHOOK_SECRET'
      , 'WHATSAPP_OWNER_PHONE_NUMBER', '*.WHATSAPP_OWNER_PHONE_NUMBER', 'email', '*.email', 'phone', '*.phone'
    ],
    censor: '[MASKIERT]'
  }
}, pino.destination({ dest: path.join(appConfig.LOG_DIRECTORY, 'deutschz-bot.log'), sync: false }));
