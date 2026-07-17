import { appConfig } from './config.js';
import { runtimeWhatsAppCredentials, whatsAppPreflight } from './integrations/whatsapp/cloud-client.js';

const missing = whatsAppPreflight({ ...runtimeWhatsAppCredentials, enabled: true });
if (!appConfig.WEBSITE_LEAD_WEBHOOK_SECRET) missing.push('WEBSITE_LEAD_WEBHOOK_SECRET');
if (!appConfig.PUBLIC_WEBHOOK_BASE_URL) missing.push('PUBLIC_WEBHOOK_BASE_URL');
const unique=[...new Set(missing)];
const masked=appConfig.WHATSAPP_OWNER_PHONE_NUMBER ? `${appConfig.WHATSAPP_OWNER_PHONE_NUMBER.slice(0,3)}********${appConfig.WHATSAPP_OWNER_PHONE_NUMBER.slice(-3)}` : 'FEHLT';

console.log(`OWNER NUMBER: ${masked}`);
console.log(`WEBSITE NOTIFY WHATSAPP: ${appConfig.WEBSITE_LEAD_NOTIFY_WHATSAPP ? 'JA' : 'NEIN'}`);
console.log(`WEBSITE NOTIFY DISCORD: ${appConfig.WEBSITE_LEAD_NOTIFY_DISCORD ? 'JA' : 'NEIN'}`);
console.log(`WEBSITE NOTIFY EMAIL: ${appConfig.WEBSITE_LEAD_NOTIFY_EMAIL ? 'JA' : 'NEIN'}`);
console.log(`LIVE WHATSAPP ENABLED: ${appConfig.WHATSAPP_ENABLED ? 'JA' : 'NEIN'}`);
console.log(unique.length ? `BLOCKER: ${unique.join(', ')}` : 'BLOCKER: KEINER');
if(unique.length) process.exitCode=2;
