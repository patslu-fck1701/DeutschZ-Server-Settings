import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Database } from '../src/database.js';
import { WhatsAppCloudClient, type WhatsAppCredentials, type WhatsAppTransport } from '../src/integrations/whatsapp/cloud-client.js';
import { verifyMetaSignature } from '../src/http/webhook-server.js';
import { LeadNotificationService, signWebsitePayload, type LeadPolicy } from '../src/services/lead-notification/lead-service.js';

const dirs: string[]=[];
afterEach(()=>dirs.splice(0).forEach(dir=>fs.rmSync(dir,{recursive:true,force:true})));
const fixed=new Date('2026-07-18T12:00:00.000Z');
const secret='test-secret-not-production';
const owner='+4915112345678';

async function fixture(overrides:Partial<LeadPolicy>={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deutschz-leads-'));dirs.push(dir);
  const db=await Database.open(path.join(dir,'bot.sqlite'));
  const policy:LeadPolicy={secret,allowedForms:['auftrag','support','preisvorschlag'],maxAgeSeconds:300,notifyWhatsApp:true,maxAttempts:5,ownerPhoneNumber:owner,now:()=>fixed,...overrides};
  return {db,service:new LeadNotificationService(db,policy),policy};
}

function payload(id='REQ-100') {
  return Buffer.from(JSON.stringify({external_request_id:id,form_name:'auftrag',name:'Patrick',discord_name:'fck1701',email:'test@example.invalid',request_type:'Modding',budget:'offen',message:'Bitte prüfen.',created_at:'2026-07-18T11:59:00.000Z'}));
}
function headers(raw:Buffer,key='idem-1',time=Math.floor(fixed.getTime()/1000).toString()) {return {timestamp:time,idempotencyKey:key,signature:`sha256=${signWebsitePayload(secret,time,raw)}`};}
const credentials:WhatsAppCredentials={enabled:true,graphApiVersion:'v-test',accessToken:'mock-token',phoneNumberId:'123',businessAccountId:'456',ownerPhoneNumber:owner,verifyToken:'verify',appSecret:'app-secret'};

describe('WebsitePublisher -> WhatsApp lead workflow',()=>{
  it('accepts a valid signed lead and persists exactly one queue item',async()=>{const x=await fixture();const raw=payload();expect(x.service.ingest(raw,headers(raw))).toEqual({requestId:'REQ-100',duplicate:false});expect(x.db.scalar<number>('SELECT COUNT(*) FROM website_leads')).toBe(1);expect(x.db.scalar<number>('SELECT COUNT(*) FROM website_lead_queue')).toBe(1);x.db.close();});
  it('rejects an invalid HMAC and expired timestamp',async()=>{const x=await fixture();const raw=payload();expect(()=>x.service.ingest(raw,{...headers(raw),signature:'sha256='+'0'.repeat(64)})).toThrow(/Signatur/);const old=Math.floor((fixed.getTime()-301_000)/1000).toString();expect(()=>x.service.ingest(raw,headers(raw,'old',old))).toThrow(/abgelaufen/);x.db.close();});
  it('deduplicates an identical request without a second queue message',async()=>{const x=await fixture();const raw=payload();x.service.ingest(raw,headers(raw));expect(x.service.ingest(raw,headers(raw,'idem-2')).duplicate).toBe(true);expect(x.db.scalar<number>('SELECT COUNT(*) FROM website_lead_queue')).toBe(1);x.db.close();});
  it('blocks replay keys for a different payload',async()=>{const x=await fixture();const first=payload('REQ-1');x.service.ingest(first,headers(first,'same'));const second=payload('REQ-2');expect(()=>x.service.ingest(second,headers(second,'same'))).toThrow(/Replay/);x.db.close();});
  it('rejects missing fields and unknown forms',async()=>{const x=await fixture();const missing=Buffer.from(JSON.stringify({external_request_id:'REQ-X'}));expect(()=>x.service.ingest(missing,headers(missing,'missing'))).toThrow();const unknown=Buffer.from(JSON.stringify({...JSON.parse(payload().toString()),external_request_id:'REQ-Y',form_name:'other'}));expect(()=>x.service.ingest(unknown,headers(unknown,'unknown'))).toThrow(/Formular/);x.db.close();});
  it('does not send when WhatsApp is disabled',async()=>{const x=await fixture();const raw=payload();x.service.ingest(raw,headers(raw));const client=new WhatsAppCloudClient({...credentials,enabled:false},vi.fn());expect(await x.service.processDueQueue(client)).toBe('DISABLED');expect(x.db.scalar<string>('SELECT status FROM website_lead_queue')).toBe('PENDING');x.db.close();});
  it('sends once through a mocked official Cloud API transport',async()=>{const x=await fixture();const raw=payload();x.service.ingest(raw,headers(raw));const transport=vi.fn<WhatsAppTransport>().mockResolvedValue({ok:true,status:200,json:{messages:[{id:'wamid.mock'}]}});const client=new WhatsAppCloudClient(credentials,transport);expect(await x.service.processDueQueue(client)).toBe('SENT');expect(await x.service.processDueQueue(client)).toBe('EMPTY');expect(transport).toHaveBeenCalledTimes(1);expect(x.db.scalar<string>('SELECT whatsapp_message_id FROM website_leads')).toBe('wamid.mock');x.db.close();});
  it('retries API errors and marks terminal failure at the configured maximum',async()=>{const x=await fixture({maxAttempts:1});const raw=payload();x.service.ingest(raw,headers(raw));const transport=vi.fn<WhatsAppTransport>().mockResolvedValue({ok:false,status:503,json:{}});const client=new WhatsAppCloudClient(credentials,transport);expect(await x.service.processDueQueue(client)).toBe('FAILED');expect(x.db.scalar<string>('SELECT status FROM website_lead_queue')).toBe('FAILED');expect(x.db.scalar<string>('SELECT status FROM website_leads')).toBe('FAILED');x.db.close();});
  it('marks an interrupted send unknown instead of risking a duplicate',async()=>{const x=await fixture();const raw=payload();x.service.ingest(raw,headers(raw));x.db.run("UPDATE website_lead_queue SET status='SENDING'");expect(x.service.recoverQueue()).toBe(1);expect(x.db.scalar<string>('SELECT status FROM website_lead_queue')).toBe('UNKNOWN');x.db.close();});
  it('accepts owner commands, persists votes/status, paginates open and rejects foreign numbers',async()=>{const x=await fixture();for(let i=1;i<=12;i++){const raw=payload(`REQ-${i}`);x.service.ingest(raw,headers(raw,`idem-${i}`));}expect(()=>x.service.executeOwnerCommand('+491111111111','OFFEN')).toThrow(/autorisiert/);expect(x.service.executeOwnerCommand(owner,'ANNEHMEN REQ-1')).toMatch(/ACCEPTED/);expect(x.service.executeOwnerCommand(owner,'START REQ-1')).toMatch(/IN_PROGRESS/);expect(x.service.executeOwnerCommand(owner,'ERLEDIGT REQ-1')).toMatch(/DONE/);expect(x.service.executeOwnerCommand(owner,'STATUS REQ-1')).toMatch(/DONE/);expect(x.service.executeOwnerCommand(owner,'OFFEN 2').split('\n').length).toBeLessThanOrEqual(11);expect(x.service.executeOwnerCommand(owner,'SUCHE Patrick')).toMatch(/SUCHERGEBNISSE/);x.db.close();});
  it('supports rejection and never needs a real network client in tests',async()=>{const x=await fixture();const raw=payload();x.service.ingest(raw,headers(raw));expect(x.service.executeOwnerCommand(owner,'ABLEHNEN REQ-100')).toMatch(/REJECTED/);x.db.close();});
  it('validates Meta X-Hub-Signature-256 in constant-length buffers',()=>{const raw=Buffer.from('{"object":"whatsapp_business_account"}');const signature=crypto.createHmac('sha256','app-secret').update(raw).digest('hex');expect(()=>verifyMetaSignature('app-secret',raw,`sha256=${signature}`)).not.toThrow();expect(()=>verifyMetaSignature('app-secret',raw,`sha256=${'0'.repeat(64)}`)).toThrow(/SIGNATURE/);});
});
