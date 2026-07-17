import crypto from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../../database.js';
import { appConfig } from '../../config.js';
import type { WhatsAppCloudClient } from '../../integrations/whatsapp/cloud-client.js';

export interface WebsiteWebhookHeaders { timestamp: string; signature: string; idempotencyKey: string; }
export interface LeadPolicy {
  secret?: string;
  allowedForms: string[];
  maxAgeSeconds: number;
  notifyWhatsApp: boolean;
  maxAttempts: number;
  ownerPhoneNumber?: string;
  now: () => Date;
}

export const runtimeLeadPolicy: LeadPolicy = {
  secret: appConfig.WEBSITE_LEAD_WEBHOOK_SECRET,
  allowedForms: appConfig.websiteLeadAllowedForms,
  maxAgeSeconds: appConfig.WEBSITE_LEAD_HMAC_MAX_AGE_SECONDS,
  notifyWhatsApp: appConfig.WEBSITE_LEAD_NOTIFY_WHATSAPP,
  maxAttempts: appConfig.WEBSITE_LEAD_QUEUE_MAX_ATTEMPTS,
  ownerPhoneNumber: appConfig.WHATSAPP_OWNER_PHONE_NUMBER,
  now: () => new Date()
};

const leadSchema = z.object({
  external_request_id: z.string().trim().min(3).max(128),
  form_name: z.string().trim().min(1).max(64).transform(value => value.toLowerCase()),
  name: z.string().trim().min(1).max(150),
  discord_name: z.string().trim().max(150).optional().nullable(),
  email: z.string().trim().email().max(254).optional().nullable(),
  request_type: z.string().trim().max(150).optional().nullable(),
  budget: z.string().trim().max(100).optional().nullable(),
  message: z.string().trim().min(1).max(10_000),
  created_at: z.string().datetime({ offset: true })
}).strict();

export type WebsiteLeadInput = z.infer<typeof leadSchema>;
interface LeadRow extends Record<string, unknown> {
  id: number; external_request_id: string; form_name: string; name: string; discord_name: string | null;
  email: string | null; request_type: string | null; budget: string | null; message: string;
  status: string; source_created_at: string; received_at: string; notification_status: string;
}

const normalizeSignature = (value: string) => value.trim().replace(/^sha256=/i, '').toLowerCase();
const normalizePhone = (value: string) => value.replace(/[^0-9]/g, '');
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export function signWebsitePayload(secret: string, timestamp: string, rawBody: Buffer): string {
  return crypto.createHmac('sha256', secret).update(timestamp).update('.').update(rawBody).digest('hex');
}

export function verifyWebsiteSignature(secret: string, headers: WebsiteWebhookHeaders, rawBody: Buffer, now: Date, maxAgeSeconds: number): void {
  if (!headers.idempotencyKey || headers.idempotencyKey.length > 200) throw new Error('Idempotency-Key fehlt oder ist ungültig.');
  const seconds = Number(headers.timestamp);
  if (!Number.isFinite(seconds)) throw new Error('Webhook-Timestamp ist ungültig.');
  if (Math.abs(now.getTime() - seconds * 1000) > maxAgeSeconds * 1000) throw new Error('Webhook-Timestamp ist abgelaufen.');
  const expected = Buffer.from(signWebsitePayload(secret, headers.timestamp, rawBody), 'hex');
  const suppliedText = normalizeSignature(headers.signature);
  if (!/^[a-f0-9]{64}$/.test(suppliedText)) throw new Error('Webhook-Signatur ist ungültig.');
  const supplied = Buffer.from(suppliedText, 'hex');
  if (!crypto.timingSafeEqual(expected, supplied)) throw new Error('Webhook-Signatur stimmt nicht.');
}

export class LeadNotificationService {
  constructor(private readonly db: Database, readonly policy: LeadPolicy = runtimeLeadPolicy) {}

  ingest(rawBody: Buffer, headers: WebsiteWebhookHeaders): { requestId: string; duplicate: boolean } {
    if (!this.policy.secret) throw new Error('Website-Webhook ist nicht aktiviert: Secret fehlt.');
    verifyWebsiteSignature(this.policy.secret, headers, rawBody, this.policy.now(), this.policy.maxAgeSeconds);
    let parsedJson: unknown;
    try { parsedJson = JSON.parse(rawBody.toString('utf8')); } catch { throw new Error('Webhook enthält ungültiges JSON.'); }
    const validated = leadSchema.safeParse(parsedJson);
    if (!validated.success) throw new Error('SCHEMA_INVALID');
    const input = validated.data;
    if (!this.policy.allowedForms.includes(input.form_name)) throw new Error('Formularname ist nicht freigegeben.');
    const payloadHash = digest(rawBody.toString('utf8'));
    const existing = this.db.rows<{external_request_id:string}>('SELECT external_request_id FROM website_leads WHERE external_request_id=? OR payload_hash=?', [input.external_request_id, payloadHash])[0];
    if (existing) return { requestId: existing.external_request_id, duplicate: true };
    if (this.db.scalar<number>('SELECT COUNT(*) FROM webhook_replays WHERE provider=? AND replay_key=?', ['websitepublisher', headers.idempotencyKey])) throw new Error('Webhook-Replay wurde blockiert.');
    const now = this.policy.now().toISOString();
    this.db.transaction(() => {
      this.db.run('INSERT INTO webhook_replays(provider,replay_key,payload_hash,received_at) VALUES(?,?,?,?)', ['websitepublisher',headers.idempotencyKey,payloadHash,now]);
      this.db.run(`INSERT INTO website_leads(external_request_id,form_name,name,discord_name,email,request_type,budget,message,status,source_created_at,received_at,notification_status,payload_hash)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, [input.external_request_id,input.form_name,input.name,input.discord_name??null,input.email??null,input.request_type??null,input.budget??null,input.message,'NEW',input.created_at,now,this.policy.notifyWhatsApp?'PENDING':'DISABLED',payloadHash]);
      const leadId = this.db.scalar<number>('SELECT id FROM website_leads WHERE external_request_id=?',[input.external_request_id])!;
      if (this.policy.notifyWhatsApp) this.db.run('INSERT INTO website_lead_queue(lead_id,status,attempts,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',[leadId,'PENDING',0,now,now,now]);
      this.db.run('INSERT INTO website_lead_audit(lead_id,external_request_id,actor_type,action,new_status,created_at) VALUES(?,?,?,?,?,?)',[leadId,input.external_request_id,'WEBSITE','RECEIVED','NEW',now]);
    });
    return { requestId: input.external_request_id, duplicate: false };
  }

  private leadMessage(lead: LeadRow): string {
    const description = lead.message.length > 700 ? `${lead.message.slice(0, 697)}…` : lead.message;
    return [
      '📨 NEUE DEUTSCHZ WEBSITE-ANFRAGE', `ID: ${lead.external_request_id}`, `Formular: ${lead.form_name}`,
      `Name: ${lead.name}`, lead.discord_name ? `Discord: ${lead.discord_name}` : null,
      lead.email ? `E-Mail: ${lead.email}` : null, lead.request_type ? `Typ: ${lead.request_type}` : null,
      lead.budget ? `Budget: ${lead.budget}` : null, `Nachricht: ${description}`, `Website-Zeitpunkt: ${lead.source_created_at}`,
      '', `Antworten: ANNEHMEN ${lead.external_request_id} | ABLEHNEN ${lead.external_request_id} | START ${lead.external_request_id} | ERLEDIGT ${lead.external_request_id}`
    ].filter((value): value is string => Boolean(value)).join('\n');
  }

  async processDueQueue(client: WhatsAppCloudClient): Promise<'DISABLED'|'EMPTY'|'SENT'|'RETRY'|'FAILED'> {
    if (!client.isEnabled() || !this.policy.ownerPhoneNumber) return 'DISABLED';
    const now = this.policy.now().toISOString();
    const row = this.db.rows<LeadRow & {queue_id:number; attempts:number}>('SELECT l.*,q.id queue_id,q.attempts FROM website_lead_queue q JOIN website_leads l ON l.id=q.lead_id WHERE q.status=? AND q.next_attempt_at<=? ORDER BY q.id LIMIT 1',['PENDING',now])[0];
    if (!row) return 'EMPTY';
    this.db.run('UPDATE website_lead_queue SET status=?,locked_at=?,updated_at=? WHERE id=? AND status=?',['SENDING',now,now,row.queue_id,'PENDING']);
    try {
      const messageId = await client.sendText(this.policy.ownerPhoneNumber, this.leadMessage(row));
      this.db.transaction(() => {
        this.db.run('UPDATE website_lead_queue SET status=?,attempts=attempts+1,locked_at=NULL,last_error=NULL,updated_at=? WHERE id=?',['SENT',now,row.queue_id]);
        this.db.run('UPDATE website_leads SET status=?,notification_status=?,whatsapp_message_id=?,retry_count=retry_count+1,last_error=NULL WHERE id=?',['NOTIFIED','SENT',messageId,row.id]);
        this.db.run('INSERT INTO website_lead_audit(lead_id,external_request_id,actor_type,action,old_status,new_status,created_at) VALUES(?,?,?,?,?,?,?)',[row.id,row.external_request_id,'SYSTEM','WHATSAPP_SENT',row.status,'NOTIFIED',now]);
      });
      return 'SENT';
    } catch (error) {
      const attempts = row.attempts + 1;
      const terminal = attempts >= this.policy.maxAttempts;
      const message = (error instanceof Error ? error.message : 'Unbekannter WhatsApp-Fehler').slice(0,500);
      const next = new Date(this.policy.now().getTime() + Math.min(3600, 30 * (2 ** (attempts - 1))) * 1000).toISOString();
      this.db.transaction(() => {
        this.db.run('UPDATE website_lead_queue SET status=?,attempts=?,next_attempt_at=?,locked_at=NULL,last_error=?,updated_at=? WHERE id=?',[terminal?'FAILED':'PENDING',attempts,next,message,now,row.queue_id]);
        this.db.run('UPDATE website_leads SET status=?,notification_status=?,retry_count=?,last_error=? WHERE id=?',[terminal?'FAILED':row.status,terminal?'FAILED':'RETRY',attempts,message,row.id]);
        this.db.run('INSERT INTO website_lead_audit(lead_id,external_request_id,actor_type,action,detail,created_at) VALUES(?,?,?,?,?,?)',[row.id,row.external_request_id,'SYSTEM',terminal?'WHATSAPP_FAILED':'WHATSAPP_RETRY',message,now]);
      });
      return terminal ? 'FAILED' : 'RETRY';
    }
  }

  recoverQueue(): number {
    const count = this.db.scalar<number>("SELECT COUNT(*) FROM website_lead_queue WHERE status='SENDING'") ?? 0;
    if (count) this.db.run("UPDATE website_lead_queue SET status='UNKNOWN',locked_at=NULL,last_error='Bot restart during send; delivery state unknown; manual review required',updated_at=? WHERE status='SENDING'",[this.policy.now().toISOString()]);
    return count;
  }

  executeOwnerCommand(from: string, text: string): string {
    if (!this.policy.ownerPhoneNumber || normalizePhone(from) !== normalizePhone(this.policy.ownerPhoneNumber)) throw new Error('WhatsApp-Absender ist nicht autorisiert.');
    const clean = text.trim();
    const [verbRaw, ...rest] = clean.split(/\s+/); const verb = (verbRaw ?? '').toUpperCase();
    if (verb === 'OFFEN') return this.openList(Number(rest[0] ?? '1'));
    if (verb === 'SUCHE') return this.search(rest.join(' '));
    const requestId = rest[0];
    if (!requestId) throw new Error('Request-ID fehlt.');
    if (verb === 'STATUS') return this.status(requestId);
    const target: Record<string,string> = { ANNEHMEN:'ACCEPTED', ABLEHNEN:'REJECTED', START:'IN_PROGRESS', ERLEDIGT:'DONE' };
    if (!target[verb]) throw new Error('Unbekannter WhatsApp-Befehl.');
    return this.changeStatus(requestId,target[verb]!);
  }

  private changeStatus(requestId: string, status: string): string {
    const lead = this.db.rows<LeadRow>('SELECT * FROM website_leads WHERE external_request_id=?',[requestId])[0];
    if (!lead) throw new Error('Anfrage nicht gefunden.');
    const now = this.policy.now().toISOString();
    this.db.transaction(() => {
      this.db.run('UPDATE website_leads SET status=?,handled_at=?,handled_by=? WHERE id=?',[status,now,'WHATSAPP_OWNER',lead.id]);
      this.db.run('INSERT INTO website_lead_audit(lead_id,external_request_id,actor_type,actor_id,action,old_status,new_status,created_at) VALUES(?,?,?,?,?,?,?,?)',[lead.id,lead.external_request_id,'WHATSAPP','OWNER','STATUS_CHANGED',lead.status,status,now]);
    });
    return `✅ ${requestId}: ${lead.status} → ${status}`;
  }

  private status(requestId: string): string {
    const lead = this.db.rows<LeadRow>('SELECT * FROM website_leads WHERE external_request_id=?',[requestId])[0];
    if (!lead) return `⚠️ ${requestId}: nicht gefunden.`;
    return `${lead.external_request_id}\nStatus: ${lead.status}\nFormular: ${lead.form_name}\nName: ${lead.name}\nEingang: ${lead.received_at}`;
  }

  private openList(page: number): string {
    const safePage = Number.isInteger(page) && page > 0 ? page : 1; const limit=10; const offset=(safePage-1)*limit;
    const rows=this.db.rows<LeadRow>("SELECT * FROM website_leads WHERE status IN ('NEW','NOTIFIED','ACCEPTED','IN_PROGRESS','FAILED') ORDER BY received_at DESC LIMIT ? OFFSET ?",[limit,offset]);
    const total=this.db.scalar<number>("SELECT COUNT(*) FROM website_leads WHERE status IN ('NEW','NOTIFIED','ACCEPTED','IN_PROGRESS','FAILED')")??0;
    if(!rows.length) return `OFFEN Seite ${safePage}: keine Einträge.`;
    return [`OFFENE ANFRAGEN – Seite ${safePage}/${Math.max(1,Math.ceil(total/limit))}`, ...rows.map(row=>`${row.external_request_id} | ${row.status} | ${row.form_name} | ${row.name}`)].join('\n');
  }

  private search(query: string): string {
    const trimmed=query.trim(); if(trimmed.length<2) throw new Error('Suchtext muss mindestens zwei Zeichen haben.');
    const like=`%${trimmed.replace(/[\\%_]/g,'\\$&')}%`;
    const rows=this.db.rows<LeadRow>("SELECT * FROM website_leads WHERE external_request_id LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR request_type LIKE ? ESCAPE '\\' OR message LIKE ? ESCAPE '\\' ORDER BY received_at DESC LIMIT 10",[like,like,like,like]);
    return rows.length ? ['SUCHERGEBNISSE',...rows.map(row=>`${row.external_request_id} | ${row.status} | ${row.name} | ${row.request_type??'-'}`)].join('\n') : 'Keine Treffer.';
  }
}
