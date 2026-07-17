import { appConfig } from '../../config.js';

export interface WhatsAppCredentials {
  enabled: boolean;
  graphApiVersion?: string;
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  ownerPhoneNumber?: string;
  verifyToken?: string;
  appSecret?: string;
}

export interface WhatsAppTransportResponse { ok: boolean; status: number; json: unknown; }
export type WhatsAppTransport = (url: string, init: RequestInit) => Promise<WhatsAppTransportResponse>;

const defaultTransport: WhatsAppTransport = async (url, init) => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  return { ok: response.ok, status: response.status, json: await response.json().catch(() => ({})) };
};

export const runtimeWhatsAppCredentials: WhatsAppCredentials = {
  enabled: appConfig.WHATSAPP_ENABLED,
  graphApiVersion: appConfig.WHATSAPP_GRAPH_API_VERSION,
  accessToken: appConfig.WHATSAPP_ACCESS_TOKEN,
  phoneNumberId: appConfig.WHATSAPP_PHONE_NUMBER_ID,
  businessAccountId: appConfig.WHATSAPP_BUSINESS_ACCOUNT_ID,
  ownerPhoneNumber: appConfig.WHATSAPP_OWNER_PHONE_NUMBER,
  verifyToken: appConfig.WHATSAPP_VERIFY_TOKEN,
  appSecret: appConfig.WHATSAPP_APP_SECRET
};

export function whatsAppPreflight(credentials: WhatsAppCredentials): string[] {
  if (!credentials.enabled) return ['WHATSAPP_ENABLED=false'];
  const missing: string[] = [];
  if (!credentials.graphApiVersion) missing.push('WHATSAPP_GRAPH_API_VERSION');
  if (!credentials.accessToken) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!credentials.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!credentials.businessAccountId) missing.push('WHATSAPP_BUSINESS_ACCOUNT_ID');
  if (!credentials.ownerPhoneNumber) missing.push('WHATSAPP_OWNER_PHONE_NUMBER');
  if (!credentials.verifyToken) missing.push('WHATSAPP_VERIFY_TOKEN');
  if (!credentials.appSecret) missing.push('WHATSAPP_APP_SECRET');
  return missing;
}

export class WhatsAppCloudClient {
  constructor(
    readonly credentials: WhatsAppCredentials = runtimeWhatsAppCredentials,
    private readonly transport: WhatsAppTransport = defaultTransport
  ) {}

  isEnabled(): boolean { return this.credentials.enabled && whatsAppPreflight(this.credentials).length === 0; }

  async sendText(to: string, body: string): Promise<string> {
    if (!this.isEnabled()) throw new Error('WhatsApp Liveversand ist deaktiviert oder unvollständig konfiguriert.');
    if (!/^\+[1-9]\d{7,14}$/.test(to)) throw new Error('WhatsApp-Zielnummer ist nicht E.164-konform.');
    const url = `https://graph.facebook.com/${encodeURIComponent(this.credentials.graphApiVersion!)}/${encodeURIComponent(this.credentials.phoneNumberId!)}/messages`;
    const response = await this.transport(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.credentials.accessToken!}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: to.slice(1), type: 'text', text: { preview_url: false, body } })
    });
    if (!response.ok) throw new Error(`WhatsApp Cloud API HTTP ${response.status}`);
    const id = (response.json as {messages?: Array<{id?: string}>})?.messages?.[0]?.id;
    if (!id) throw new Error('WhatsApp Cloud API lieferte keine Message-ID.');
    return id;
  }
}
