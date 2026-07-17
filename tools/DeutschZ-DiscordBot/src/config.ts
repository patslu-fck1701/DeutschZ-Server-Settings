import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

loadDotEnv(process.env.DEUTSCHZ_ENV_FILE ? { path: process.env.DEUTSCHZ_ENV_FILE, quiet: true } : { quiet: true });

const emptyToUndefined = (value: unknown) => value === '' ? undefined : value;
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const optionalPort = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  TIMEZONE: z.string().default('Europe/Berlin'),
  DISCORD_TOKEN: optionalString,
  DISCORD_CLIENT_ID: optionalString,
  DISCORD_GUILD_ID: optionalString,
  SERVER_NAME: z.string().default('DeutschZ'),
  DAYZ_SERVER_IP: z.string().default('193.135.10.126'),
  DAYZ_SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(20076),
  DAYZ_QUERY_PORT: optionalPort,
  DAYZ_MAX_PLAYERS: z.coerce.number().int().positive().default(30),
  DAYZ_MAP: z.string().default('Chernarusplus'),
  DAYZ_STATUS_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(60),
  DAYZ_RESTART_TIMES: z.string().default('01:00,07:00,13:00,19:00'),
  DAYZ_RESTART_REMINDERS: z.string().default('60,15,5'),
  DISCORD_INVITE_URL: z.string().url().default('https://discord.gg/FHzZ7BykFk'),
  WEBSITE_URL: z.string().url().default('https://project23947.websitepublisher.ai'),
  SERVER_SETTINGS_REPOSITORY: z.string().url().default('https://github.com/patslu-fck1701/DeutschZ-Server-Settings.git'),
  MODZ_REPOSITORY: z.string().url().default('https://github.com/patslu-fck1701/DeutschZ-ModZ.git'),
  DATABASE_URL: z.string().default('./data/deutschz.sqlite'),
  BACKUP_DIRECTORY: z.string().default('./backups'),
  LOG_DIRECTORY: z.string().default('./logs'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MAX_OPEN_TICKETS: z.coerce.number().int().min(1).max(20).default(2),
  BACKUP_RETENTION: z.coerce.number().int().min(1).max(365).default(14),
  STATUS_FAILURE_THRESHOLD: z.coerce.number().int().min(2).max(20).default(3),
  SOCIAL_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  KILLFEED_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true')
  ,FTP_HOST: optionalString
  ,FTP_PORT: z.coerce.number().int().min(1).max(65535).default(21)
  ,FTP_USER: optionalString
  ,FTP_PASSWORD: optionalString
  ,UPLOAD_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true')
  ,FTP_UPLOAD_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true')
  ,UPLOAD_REQUIRE_SECOND_APPROVER: z.enum(['true', 'false']).default('true').transform(v => v === 'true')
  ,UPLOAD_CONFIRMATION_CODE_REQUIRED: z.enum(['true', 'false']).default('true').transform(v => v === 'true')
  ,UPLOAD_APPROVAL_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(10)
  ,UPLOAD_CONFIRMATION_CODE_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(60).default(5)
  ,UPLOAD_GLOBAL_LOCK: z.enum(['true', 'false']).default('true').transform(v => v === 'true')
  ,UPLOAD_CREATE_REMOTE_BACKUP: z.enum(['true', 'false']).default('true').transform(v => v === 'true')
  ,UPLOAD_MAX_FILE_SIZE_MB: z.coerce.number().int().min(1).max(10240).default(500)
  ,UPLOAD_MAX_FILES_PER_REQUEST: z.coerce.number().int().min(1).max(10000).default(100)
  ,UPLOAD_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(86400).default(30)
  ,ALLOWED_UPLOAD_SOURCE_ROOTS: z.string().default('E:\\DeutschZ\\DeutschZServer;E:\\DeutschZ\\DeutschZ-Server-Settings')
  ,ALLOWED_FTP_TARGET_ROOTS: z.string().default('/gameserver/;/gameserver/mpmissions/;/gameserver/profiles/')
  ,UPLOAD_APPROVAL_CHANNEL_ID: optionalString
  ,UPLOAD_AUDIT_CHANNEL_ID: optionalString
  ,OWNER_USER_ID: z.string().default('680138829965164553')
  ,APPROVER_USER_IDS: z.string().default('680138829965164553,769953999163621397,526160792538710016')
  ,HONORARY_USER_ID: z.string().default('424575219219562503')
  ,DISCORD_GUILD_MEMBERS_INTENT: z.enum(['true', 'false']).default('true').transform(v => v === 'true')
  ,DISCORD_MESSAGE_CONTENT_INTENT: z.enum(['true', 'false']).default('true').transform(v => v === 'true')
  ,FEATURE_DAYZ_ASSISTANT: z.enum(['true', 'false']).default('true').transform(v => v === 'true')
  ,FEATURE_EXPANSION_MARKET: z.enum(['true', 'false']).default('true').transform(v => v === 'true')
  ,FEATURE_ADMIN_IDEA_BOARD: z.enum(['true', 'false']).default('true').transform(v => v === 'true')
  ,DAYZ_SERVER_DATA_MODE: z.enum(['local', 'sftp', 'private-api']).default('local')
  ,DAYZ_SERVER_ROOT: optionalString
  ,DAYZ_MISSION_PATH: optionalString
  ,DAYZ_PROFILE_PATH: optionalString
  ,DAYZ_WORKSHOP_PATH: optionalString
  ,DAYZ_BOT_CONTENT_PATH: optionalString
  ,DAYZ_DATA_ALLOWED_ROOTS: z.string().default('E:\\DeutschZ\\DeutschZServer;E:\\DeutschZ\\DeutschZ-Server-Settings;E:\\DeutschZ\\DeutschZ-ModZ')
  ,DAYZ_BRIDGE_URL: z.string().url().default('http://127.0.0.1:8765')
  ,DAYZ_BRIDGE_TOKEN: optionalString
  ,DAYZ_MARKET_SYNC_SECONDS: z.coerce.number().int().min(15).max(300).default(30)
  ,DAYZ_INDEX_MAX_FILE_MB: z.coerce.number().int().min(1).max(250).default(25)
  ,DISCORD_PLAYER_CATEGORY_ID: optionalString
  ,DISCORD_QUESTION_CHANNEL_ID: optionalString
  ,DISCORD_MARKET_CHANNEL_ID: optionalString
  ,DISCORD_HELP_CHANNEL_ID: optionalString
  ,DISCORD_ADMIN_CATEGORY_ID: optionalString
  ,DISCORD_ADMIN_FORUM_ID: optionalString
  ,DISCORD_SYNC_LOG_CHANNEL_ID: optionalString
  ,DISCORD_ADMIN_ROLE_IDS: z.string().default('')
  ,OBJECT_STORAGE_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true')
  ,OBJECT_STORAGE_ENDPOINT: optionalString
  ,OBJECT_STORAGE_BUCKET: optionalString
  ,OBJECT_STORAGE_ACCESS_KEY: optionalString
  ,OBJECT_STORAGE_SECRET_KEY: optionalString
  ,IMAGE_CACHE_PATH: z.string().default('./data/image-cache')
  ,IMAGE_MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(25).default(10)
  ,KNOWLEDGE_EMBEDDINGS_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true')
  ,KNOWLEDGE_MODEL: optionalString
  ,ANSWER_MODEL: optionalString
  ,WEBSITE_LEAD_WEBHOOK_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true')
  ,WEBSITE_LEAD_WEBHOOK_SECRET: optionalString
  ,WEBSITE_LEAD_ALLOWED_FORMS: z.string().default('auftrag,support,preisvorschlag')
  ,WEBSITE_LEAD_NOTIFY_WHATSAPP: z.enum(['true', 'false']).default('true').transform(v => v === 'true')
  ,WEBSITE_LEAD_NOTIFY_DISCORD: z.enum(['true', 'false']).default('false').transform(v => v === 'true')
  ,WEBSITE_LEAD_NOTIFY_EMAIL: z.enum(['true', 'false']).default('false').transform(v => v === 'true')
  ,WEBSITE_LEAD_MAX_PAYLOAD_KB: z.coerce.number().int().min(8).max(1024).default(128)
  ,WEBSITE_LEAD_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(1000).default(30)
  ,WEBSITE_LEAD_HMAC_MAX_AGE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300)
  ,WEBSITE_LEAD_QUEUE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5)
  ,WHATSAPP_ENABLED: z.enum(['true', 'false']).default('false').transform(v => v === 'true')
  ,WHATSAPP_GRAPH_API_VERSION: optionalString
  ,WHATSAPP_ACCESS_TOKEN: optionalString
  ,WHATSAPP_PHONE_NUMBER_ID: optionalString
  ,WHATSAPP_BUSINESS_ACCOUNT_ID: optionalString
  ,WHATSAPP_OWNER_PHONE_NUMBER: z.preprocess(emptyToUndefined, z.string().regex(/^\+[1-9]\d{7,14}$/).optional())
  ,WHATSAPP_VERIFY_TOKEN: optionalString
  ,WHATSAPP_APP_SECRET: optionalString
  ,PUBLIC_WEBHOOK_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().refine(value => value.startsWith('https://'), 'HTTPS erforderlich').optional())
  ,WEBHOOK_BIND_HOST: z.string().default('127.0.0.1')
  ,WEBHOOK_PORT: z.coerce.number().int().min(1).max(65535).default(8787)
}).passthrough();

function withAliases(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    NODE_ENV: env.NODE_ENV || env.BOT_ENV,
    TIMEZONE: env.TIMEZONE || env.TZ,
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID || env.CLIENT_ID,
    DISCORD_GUILD_ID: env.DISCORD_GUILD_ID || env.GUILD_ID,
    BOT_LOG_CHANNEL_ID: env.BOT_LOG_CHANNEL_ID || env.DISCORD_LOG_CHANNEL_ID || env.CHANNEL_ID,
    SERVER_NAME: env.SERVER_NAME || env.DAYZ_SERVER_NAME,
    DAYZ_STATUS_INTERVAL_SECONDS: env.DAYZ_STATUS_INTERVAL_SECONDS || env.STATUS_CHECK_INTERVAL_SECONDS,
    DAYZ_RESTART_REMINDERS: env.DAYZ_RESTART_REMINDERS || env.DAYZ_RESTART_WARN_MINUTES,
    DISCORD_INVITE_URL: env.DISCORD_INVITE_URL || env.DEUTSCHZ_DISCORD_INVITE,
    WEBSITE_URL: env.WEBSITE_URL || env.DEUTSCHZ_WEBSITE_URL,
    SERVER_SETTINGS_REPOSITORY: env.SERVER_SETTINGS_REPOSITORY || env.DEUTSCHZ_SETTINGS_REPO_URL,
    MODZ_REPOSITORY: env.MODZ_REPOSITORY || env.DEUTSCHZ_MOD_REPO_URL,
    LOG_DIRECTORY: env.LOG_DIRECTORY || env.BOT_LOG_DIR,
    STATUS_FAILURE_THRESHOLD: env.STATUS_FAILURE_THRESHOLD,
    STATUS_CHANNEL_ID: env.STATUS_CHANNEL_ID || env.DISCORD_STATUS_CHANNEL_ID,
    RESTART_CHANNEL_ID: env.RESTART_CHANNEL_ID || env.DISCORD_RESTART_CHANNEL_ID,
    ADMIN_ROLE_ID: env.ADMIN_ROLE_ID || env.DISCORD_ADMIN_ROLE_ID,
    MODERATOR_ROLE_ID: env.MODERATOR_ROLE_ID || env.DISCORD_MOD_ROLE_ID
  };
}

const parsed = schema.safeParse(withAliases(process.env));
if (!parsed.success) {
  const names = parsed.error.issues.map(issue => issue.path.join('.')).join(', ');
  throw new Error(`Ungültige Konfiguration: ${names}`);
}

const raw = parsed.data;
const parseCsv = (value: string) => value.split(',').map(v => v.trim()).filter(Boolean);
const parseRestartTimes = (value: string): string[] => {
  const tokens = value.match(/\d{1,2}(?::\d{2})?/g) ?? [];
  return tokens.map(token => {
    const [hourText, minuteText = '00'] = token.split(':');
    const hour = Number(hourText); const minute = Number(minuteText);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}` : '';
  }).filter(Boolean);
};

export const appConfig = {
  ...raw,
  UPLOAD_ENABLED: raw.UPLOAD_ENABLED && raw.FTP_UPLOAD_ENABLED,
  DISCORD_TOKEN: raw.DISCORD_TOKEN?.trim().replace(/^Bot\s+/i, ''),
  restartTimes: parseRestartTimes(raw.DAYZ_RESTART_TIMES),
  restartReminders: parseCsv(raw.DAYZ_RESTART_REMINDERS).map(Number).filter(Number.isFinite),
  approverUserIds: parseCsv(raw.APPROVER_USER_IDS),
  allowedUploadSourceRoots: raw.ALLOWED_UPLOAD_SOURCE_ROOTS.split(';').map(value => value.trim()).filter(Boolean),
  allowedFtpTargetRoots: raw.ALLOWED_FTP_TARGET_ROOTS.split(';').map(value => value.trim()).filter(Boolean),
  dayzDataAllowedRoots: raw.DAYZ_DATA_ALLOWED_ROOTS.split(';').map(value => value.trim()).filter(Boolean),
  discordAdminRoleIds: parseCsv(raw.DISCORD_ADMIN_ROLE_IDS),
  websiteLeadAllowedForms: parseCsv(raw.WEBSITE_LEAD_ALLOWED_FORMS).map(value => value.toLowerCase()),
  discordReady: Boolean(raw.DISCORD_TOKEN && raw.DISCORD_CLIENT_ID && raw.DISCORD_GUILD_ID)
} as const;

export function safeConfigStatus(): Record<string, string | number | boolean> {
  return {
    NODE_ENV: appConfig.NODE_ENV,
    TIMEZONE: appConfig.TIMEZONE,
    DISCORD_TOKEN: appConfig.DISCORD_TOKEN ? 'gesetzt' : 'fehlt',
    DISCORD_CLIENT_ID: appConfig.DISCORD_CLIENT_ID ? 'gesetzt' : 'fehlt',
    DISCORD_GUILD_ID: appConfig.DISCORD_GUILD_ID ? 'gesetzt' : 'fehlt',
    DAYZ_SERVER_IP: appConfig.DAYZ_SERVER_IP,
    DAYZ_SERVER_PORT: appConfig.DAYZ_SERVER_PORT,
    DAYZ_QUERY_PORT: appConfig.DAYZ_QUERY_PORT ?? 'nicht konfiguriert',
    SOCIAL_ENABLED: appConfig.SOCIAL_ENABLED,
    KILLFEED_ENABLED: appConfig.KILLFEED_ENABLED
    ,DISCORD_GUILD_MEMBERS_INTENT: appConfig.DISCORD_GUILD_MEMBERS_INTENT
    ,DISCORD_MESSAGE_CONTENT_INTENT: appConfig.DISCORD_MESSAGE_CONTENT_INTENT
    ,APPROVER_USER_IDS: appConfig.approverUserIds.length
    ,OWNER_USER_ID: appConfig.OWNER_USER_ID ? 'gesetzt' : 'fehlt'
    ,FTP_CONFIGURATION: appConfig.FTP_HOST && appConfig.FTP_USER && appConfig.FTP_PASSWORD ? 'vorhanden' : 'unvollständig'
    ,UPLOAD_ENABLED: appConfig.UPLOAD_ENABLED
    ,FTP_UPLOAD_ENABLED: appConfig.FTP_UPLOAD_ENABLED
    ,FEATURE_DAYZ_ASSISTANT: appConfig.FEATURE_DAYZ_ASSISTANT
    ,FEATURE_EXPANSION_MARKET: appConfig.FEATURE_EXPANSION_MARKET
    ,FEATURE_ADMIN_IDEA_BOARD: appConfig.FEATURE_ADMIN_IDEA_BOARD
    ,DAYZ_SERVER_DATA_MODE: appConfig.DAYZ_SERVER_DATA_MODE
    ,DAYZ_SERVER_ROOT: appConfig.DAYZ_SERVER_ROOT ? 'gesetzt' : 'fehlt'
    ,DAYZ_BRIDGE_TOKEN: appConfig.DAYZ_BRIDGE_TOKEN ? 'gesetzt' : 'fehlt'
    ,OBJECT_STORAGE_CREDENTIALS: appConfig.OBJECT_STORAGE_ACCESS_KEY && appConfig.OBJECT_STORAGE_SECRET_KEY ? 'gesetzt' : 'fehlt'
    ,WEBSITE_LEAD_WEBHOOK_ENABLED: appConfig.WEBSITE_LEAD_WEBHOOK_ENABLED
    ,WEBSITE_LEAD_WEBHOOK_SECRET: appConfig.WEBSITE_LEAD_WEBHOOK_SECRET ? 'gesetzt' : 'fehlt'
    ,WHATSAPP_ENABLED: appConfig.WHATSAPP_ENABLED
    ,WHATSAPP_CONFIGURATION: appConfig.WHATSAPP_ACCESS_TOKEN && appConfig.WHATSAPP_PHONE_NUMBER_ID && appConfig.WHATSAPP_BUSINESS_ACCOUNT_ID && appConfig.WHATSAPP_VERIFY_TOKEN && appConfig.WHATSAPP_APP_SECRET && appConfig.WHATSAPP_OWNER_PHONE_NUMBER ? 'vollständig' : 'unvollständig'
    ,WHATSAPP_OWNER_PHONE_NUMBER: appConfig.WHATSAPP_OWNER_PHONE_NUMBER ? `${appConfig.WHATSAPP_OWNER_PHONE_NUMBER.slice(0, 3)}********${appConfig.WHATSAPP_OWNER_PHONE_NUMBER.slice(-3)}` : 'fehlt'
    ,PUBLIC_WEBHOOK_BASE_URL: appConfig.PUBLIC_WEBHOOK_BASE_URL ? 'gesetzt' : 'fehlt'
  };
}
