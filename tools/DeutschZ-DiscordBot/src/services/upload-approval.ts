import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { GuildMember } from 'discord.js';
import { appConfig } from '../config.js';
import type { Database } from '../database.js';

export type UploadStatus = 'PENDING'|'APPROVED'|'REJECTED'|'EXPIRED'|'CANCELLED'|'UPLOADING'|'SUCCESS'|'FAILED'|'ROLLBACK'|'UNKNOWN';

export interface UploadPolicy {
  enabled:boolean; requireSecondApprover:boolean; confirmationCodeRequired:boolean;
  approvalTimeoutMinutes:number; confirmationCodeTimeoutMinutes:number; globalLock:boolean;
  createRemoteBackup:boolean; maxFileSizeMb:number; maxFiles:number; cooldownSeconds:number;
  sourceRoots:string[]; targetRoots:string[];
}

export interface UploadManifest { sourcePath:string; targetPath:string; fileName:string; fileSize:number; fileCount:number; sha256:string; files:string[]; dangerous:boolean; }
export interface UploadRequestRecord extends UploadManifest { requestId:string; requesterUserId:string; approverUserId?:string; guildId:string; channelId?:string; uploadType:string; serverArea:string; status:UploadStatus; createdAt:string; expiresAt:string; }
export interface UploadExecutor { uploadAtomic(request:UploadRequestRecord, options:{createBackup:boolean}):Promise<void>; rollback?(request:UploadRequestRecord):Promise<void>; }

export const runtimeUploadPolicy:UploadPolicy = {
  enabled:appConfig.UPLOAD_ENABLED,
  requireSecondApprover:appConfig.UPLOAD_REQUIRE_SECOND_APPROVER,
  confirmationCodeRequired:appConfig.UPLOAD_CONFIRMATION_CODE_REQUIRED,
  approvalTimeoutMinutes:appConfig.UPLOAD_APPROVAL_TIMEOUT_MINUTES,
  confirmationCodeTimeoutMinutes:appConfig.UPLOAD_CONFIRMATION_CODE_TIMEOUT_MINUTES,
  globalLock:appConfig.UPLOAD_GLOBAL_LOCK,
  createRemoteBackup:appConfig.UPLOAD_CREATE_REMOTE_BACKUP,
  maxFileSizeMb:appConfig.UPLOAD_MAX_FILE_SIZE_MB,
  maxFiles:appConfig.UPLOAD_MAX_FILES_PER_REQUEST,
  cooldownSeconds:appConfig.UPLOAD_COOLDOWN_SECONDS,
  sourceRoots:appConfig.allowedUploadSourceRoots,
  targetRoots:appConfig.allowedFtpTargetRoots
};

const forbiddenNames = [/^\.env(?:\.|$)/i,/\.pem$/i,/\.key$/i,/\.pfx$/i,/\.p12$/i,/^id_rsa$/i,/^secrets?\./i,/^credentials?\./i,/\.privatekey$/i,/\.biprivatekey$/i];
const criticalNames = /(?:serverDZ\.cfg|start\.bat|cfgeconomycore|types\.xml|expansion.*market|\.pbo$|\.bisign$|\.bikey$|mpmissions?)/i;
const windows = process.platform === 'win32';
const canonical = (value:string) => (windows ? value.toLowerCase() : value).replace(/[\\/]+$/,'');
const inside = (child:string, root:string) => { const c=canonical(child); const r=canonical(root); return c===r || c.startsWith(`${r}${path.sep}`); };
const auditTime = () => new Date().toISOString();

function assertSafeFile(file:string, relative:string):void {
  const base=path.basename(file);
  if(forbiddenNames.some(pattern=>pattern.test(base))) throw new Error(`Verbotene Datei: ${relative}`);
  if(relative.split(/[\\/]/).some(segment=>/^(?:logs?|temp|tmp)$/i.test(segment))) throw new Error(`Uploads aus Log-/Temp-Ordnern sind gesperrt: ${relative}`);
  const stat=fs.lstatSync(file);
  if(stat.isSymbolicLink()) throw new Error(`Symlink/Junction ist nicht erlaubt: ${relative}`);
  if(!stat.isFile()) throw new Error(`Kein reguläres File: ${relative}`);
  const descriptor=fs.openSync(file,'r'); fs.closeSync(descriptor);
  if(stat.size===0 && /(?:\.json$|\.xml$|\.cfg$|\.pbo$|\.bisign$)/i.test(file)) throw new Error(`Leere kritische Datei: ${relative}`);
}

function collectFiles(root:string):string[]{
  const stat=fs.lstatSync(root);
  if(stat.isSymbolicLink()) throw new Error('Symlink/Junction als Quelle ist nicht erlaubt.');
  if(stat.isFile()) return [root];
  if(!stat.isDirectory()) throw new Error('Quelle ist weder Datei noch Ordner.');
  const result:string[]=[];
  const walk=(directory:string)=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const full=path.join(directory,entry.name); if(entry.isSymbolicLink()) throw new Error(`Symlink/Junction ist nicht erlaubt: ${full}`); if(entry.isDirectory()) walk(full); else if(entry.isFile()) result.push(full);}};
  walk(root); return result.sort((a,b)=>a.localeCompare(b));
}

function validateStructured(file:string):void {
  const lower=file.toLowerCase();
  if(lower.endsWith('.json')) JSON.parse(fs.readFileSync(file,'utf8'));
  if(lower.endsWith('.xml')) {
    const source=fs.readFileSync(file,'utf8');
    const validation=XMLValidator.validate(source); if(validation!==true) throw new Error(`Ungültiges XML: ${validation.err.msg}`);
    new XMLParser({ignoreAttributes:false,allowBooleanAttributes:true}).parse(source);
    const names=[...source.matchAll(/<type\s+name=["']([^"']+)["']/gi)].map(match=>match[1]!.toLowerCase());
    const duplicates=names.filter((name,index)=>names.indexOf(name)!==index);
    if(duplicates.length) throw new Error(`Doppelte XML-Type-Klasse: ${[...new Set(duplicates)].join(', ')}`);
  }
}

function assertPboPairs(files:string[]):void {
  const normalized=files.map(file=>file.toLowerCase());
  for(const file of files.filter(item=>item.toLowerCase().endsWith('.pbo'))){
    const prefix=file.toLowerCase();
    if(!normalized.some(candidate=>candidate.startsWith(`${prefix}.`) && candidate.endsWith('.bisign'))) throw new Error(`BISIGN fehlt für ${path.basename(file)}`);
  }
}

export function preflightUpload(sourcePath:string,targetPath:string,policy:UploadPolicy=runtimeUploadPolicy):UploadManifest {
  if(!sourcePath || !fs.existsSync(sourcePath)) throw new Error('Uploadquelle existiert nicht.');
  if(targetPath.includes('..') || targetPath.includes('\\') || targetPath.includes('\0')) throw new Error('Ungültiger FTP-Zielpfad.');
  const normalizedTarget=path.posix.normalize(targetPath);
  if(!normalizedTarget.startsWith('/')) throw new Error('FTP-Zielpfad muss absolut sein.');
  const targetAllowed=policy.targetRoots.some(root=>{const normalized=path.posix.normalize(root.endsWith('/')?root:`${root}/`); return normalizedTarget===normalized.slice(0,-1) || normalizedTarget.startsWith(normalized);});
  if(!targetAllowed) throw new Error('FTP-Zielpfad liegt außerhalb der Allowlist.');
  const realSource=fs.realpathSync(sourcePath);
  const realRoots=policy.sourceRoots.filter(root=>fs.existsSync(root)).map(root=>fs.realpathSync(root));
  if(!realRoots.some(root=>inside(realSource,root))) throw new Error('Uploadquelle liegt außerhalb der Allowlist.');
  const files=collectFiles(realSource);
  if(!files.length) throw new Error('Uploadquelle enthält keine Dateien.');
  if(files.length>policy.maxFiles) throw new Error(`Zu viele Dateien: ${files.length}/${policy.maxFiles}`);
  const rootStat=fs.statSync(realSource); const base=rootStat.isDirectory()?realSource:path.dirname(realSource);
  let total=0; const hash=crypto.createHash('sha256'); const relativeFiles:string[]=[];
  for(const file of files){const relative=path.relative(base,file)||path.basename(file); assertSafeFile(file,relative); validateStructured(file); const data=fs.readFileSync(file); total+=data.length; const ownHash=crypto.createHash('sha256').update(data).digest('hex'); hash.update(`${relative.replace(/\\/g,'/')}\0${data.length}\0${ownHash}\n`); relativeFiles.push(relative.replace(/\\/g,'/'));}
  if(total>policy.maxFileSizeMb*1024*1024) throw new Error(`Uploadgröße überschreitet ${policy.maxFileSizeMb} MB.`);
  assertPboPairs(files);
  return {sourcePath:realSource,targetPath:normalizedTarget,fileName:path.basename(realSource),fileSize:total,fileCount:files.length,sha256:hash.digest('hex'),files:relativeFiles,dangerous:files.some(file=>criticalNames.test(file)) || criticalNames.test(normalizedTarget)};
}

export function isAuthorizedUploadActor(member:GuildMember, uploadType:string, targetPath:string):boolean {
  if(member.isCommunicationDisabled()) return false;
  if(appConfig.approverUserIds.includes(member.id)) return true;
  const configuredRoleIds=new Set(appConfig.discordAdminRoleIds);
  const hasConfiguredRole=member.roles.cache.some(role=>configuredRoleIds.has(role.id));
  if(!hasConfiguredRole) return false;
  if(['settings','sync-settings'].includes(uploadType) || /serverDZ\.cfg|start\.bat|mpmissions|cfgeconomycore/i.test(targetPath)) return false;
  return ['mod','push-mod','file','upload','deploy'].includes(uploadType);
}

function rowToRequest(row:Record<string,unknown>):UploadRequestRecord {
  return {requestId:String(row.request_id),requesterUserId:String(row.requester_user_id),approverUserId:row.approver_user_id?String(row.approver_user_id):undefined,guildId:String(row.guild_id),channelId:row.channel_id?String(row.channel_id):undefined,sourcePath:String(row.source_path),targetPath:String(row.target_path),fileName:String(row.file_name),fileSize:Number(row.file_size),fileCount:Number(row.file_count),sha256:String(row.sha256),files:[],dangerous:criticalNames.test(String(row.file_name))||criticalNames.test(String(row.target_path)),uploadType:String(row.upload_type),serverArea:String(row.server_area),status:String(row.status) as UploadStatus,createdAt:String(row.created_at),expiresAt:String(row.expires_at)};
}

export class UploadApprovalService {
  constructor(private readonly db:Database, private readonly policy:UploadPolicy=runtimeUploadPolicy) {}
  private audit(guildId:string,channelId:string|undefined,requestId:string|undefined,actor:string|undefined,action:string,detail?:string):void { this.db.run('INSERT INTO upload_audit(request_id,actor_user_id,guild_id,channel_id,action,detail,created_at) VALUES(?,?,?,?,?,?,?)',[requestId??null,actor??null,guildId,channelId??null,action,detail??null,auditTime()]); }
  recoverInterrupted():number { const count=this.db.scalar<number>("SELECT COUNT(*) FROM upload_requests WHERE status='UPLOADING'")??0; if(count) this.db.run("UPDATE upload_requests SET status='UNKNOWN',error_code='BOT_RESTART',error_message='Bot-Neustart während Upload; manuelle Prüfung erforderlich',finished_at=? WHERE status='UPLOADING'",[auditTime()]); return count; }
  expire():number { const rows=this.db.rows<{request_id:string;guild_id:string;channel_id:string}>("SELECT request_id,guild_id,channel_id FROM upload_requests WHERE status='PENDING' AND expires_at<=?",[auditTime()]); for(const row of rows){this.db.run("UPDATE upload_requests SET status='EXPIRED',finished_at=? WHERE request_id=? AND status='PENDING'",[auditTime(),row.request_id]); this.audit(row.guild_id,row.channel_id,row.request_id,undefined,'EXPIRED');} return rows.length; }
  get(requestId:string):UploadRequestRecord|undefined { const row=this.db.rows<Record<string,unknown>>('SELECT * FROM upload_requests WHERE request_id=?',[requestId])[0]; return row?rowToRequest(row):undefined; }
  setMessage(requestId:string,channelId:string,messageId:string):void { this.db.run('UPDATE upload_requests SET channel_id=?,message_id=? WHERE request_id=? AND status=\'PENDING\'',[channelId,messageId,requestId]); }
  create(input:{requesterUserId:string;guildId:string;channelId?:string;sourcePath:string;targetPath:string;uploadType:string;serverArea:string;gitCommit?:string;gitBranch?:string}):UploadRequestRecord {
    if(!this.policy.enabled) throw new Error('FTP-Upload ist deaktiviert (UPLOAD_ENABLED=false).');
    const latest=this.db.scalar<string>('SELECT created_at FROM upload_requests WHERE requester_user_id=? ORDER BY id DESC LIMIT 1',[input.requesterUserId]); if(latest && Date.now()-Date.parse(latest)<this.policy.cooldownSeconds*1000) throw new Error('Upload-Cooldown ist aktiv.');
    const manifest=preflightUpload(input.sourcePath,input.targetPath,this.policy); const requestId=`REQ-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; const created=auditTime(); const expires=new Date(Date.now()+this.policy.approvalTimeoutMinutes*60_000).toISOString();
    this.db.run('INSERT INTO upload_requests(request_id,requester_user_id,guild_id,channel_id,source_path,target_path,file_name,file_size,sha256,upload_type,server_area,file_count,git_commit,git_branch,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[requestId,input.requesterUserId,input.guildId,input.channelId??null,manifest.sourcePath,manifest.targetPath,manifest.fileName,manifest.fileSize,manifest.sha256,input.uploadType,input.serverArea,manifest.fileCount,input.gitCommit??null,input.gitBranch??null,'PENDING',created,expires]); this.audit(input.guildId,input.channelId,requestId,input.requesterUserId,'CREATED',`type=${input.uploadType}; files=${manifest.fileCount}; size=${manifest.fileSize}; sha256=${manifest.sha256}`); return {...manifest,requestId,requesterUserId:input.requesterUserId,guildId:input.guildId,channelId:input.channelId,uploadType:input.uploadType,serverArea:input.serverArea,status:'PENDING',createdAt:created,expiresAt:expires};
  }
  beginApproval(requestId:string,approverId:string):string|null { const request=this.get(requestId); if(!request||request.status!=='PENDING') throw new Error('Anfrage ist nicht mehr offen.'); if(Date.parse(request.expiresAt)<=Date.now()){this.expire();throw new Error('Anfrage ist abgelaufen.');} if(this.policy.requireSecondApprover&&request.requesterUserId===approverId&&approverId!==appConfig.OWNER_USER_ID) throw new Error('Vier-Augen-Prinzip: Antragsteller darf nicht selbst freigeben.'); const latest=preflightUpload(request.sourcePath,request.targetPath,this.policy); if(latest.sha256!==request.sha256) throw new Error('Datei oder Hash wurde geändert. Neue Anfrage erforderlich.'); if(!this.policy.confirmationCodeRequired){this.approve(requestId,approverId);return null;} const code=crypto.randomBytes(3).toString('hex').toUpperCase(); const phrase=`UPLOAD ${requestId} ${code} BESTÄTIGEN`; const digest=crypto.createHash('sha256').update(phrase).digest('hex'); const expires=new Date(Date.now()+this.policy.confirmationCodeTimeoutMinutes*60_000).toISOString(); this.db.run("UPDATE upload_requests SET confirmation_code_hash=?,confirmation_code_expires_at=? WHERE request_id=? AND status='PENDING'",[digest,expires,requestId]); this.audit(request.guildId,request.channelId,requestId,approverId,'CONFIRMATION_REQUESTED'); return phrase; }
  confirm(requestId:string,approverId:string,phrase:string):void { const row=this.db.rows<Record<string,unknown>>('SELECT confirmation_code_hash,confirmation_code_expires_at FROM upload_requests WHERE request_id=?',[requestId])[0]; if(!row?.confirmation_code_hash||Date.parse(String(row.confirmation_code_expires_at))<=Date.now()) throw new Error('Bestätigungscode fehlt oder ist abgelaufen.'); const digest=crypto.createHash('sha256').update(phrase.trim()).digest('hex'); if(!crypto.timingSafeEqual(Buffer.from(digest),Buffer.from(String(row.confirmation_code_hash)))) throw new Error('Bestätigungscode ist ungültig.'); this.approve(requestId,approverId); }
  private approve(requestId:string,approverId:string):void { const request=this.get(requestId); if(!request||request.status!=='PENDING') throw new Error('Anfrage ist nicht mehr offen.'); if(this.policy.requireSecondApprover&&request.requesterUserId===approverId&&approverId!==appConfig.OWNER_USER_ID) throw new Error('Vier-Augen-Prinzip verletzt.'); const latest=preflightUpload(request.sourcePath,request.targetPath,this.policy); if(latest.sha256!==request.sha256) throw new Error('Hash geändert. Neue Anfrage erforderlich.'); this.db.run("UPDATE upload_requests SET status='APPROVED',approver_user_id=?,approved_at=?,confirmation_code_hash=NULL,confirmation_code_expires_at=NULL WHERE request_id=? AND status='PENDING'",[approverId,auditTime(),requestId]); this.audit(request.guildId,request.channelId,requestId,approverId,'APPROVED',approverId===appConfig.OWNER_USER_ID?'OWNER_OVERRIDE=true':undefined); }
  reject(requestId:string,actorId:string):void { this.finishPending(requestId,actorId,'REJECTED'); }
  cancel(requestId:string,actorId:string):void { const request=this.get(requestId); if(!request||request.requesterUserId!==actorId) throw new Error('Nur der Antragsteller darf abbrechen.'); this.finishPending(requestId,actorId,'CANCELLED'); }
  private finishPending(requestId:string,actorId:string,status:'REJECTED'|'CANCELLED'):void { const request=this.get(requestId); if(!request||request.status!=='PENDING') throw new Error('Anfrage ist nicht mehr offen.'); this.db.run('UPDATE upload_requests SET status=?,finished_at=? WHERE request_id=? AND status=\'PENDING\'',[status,auditTime(),requestId]); this.audit(request.guildId,request.channelId,requestId,actorId,status); }
  async execute(requestId:string,executor:UploadExecutor):Promise<void> { const request=this.get(requestId); if(!request||request.status!=='APPROVED') throw new Error('Upload ist nicht freigegeben.'); if(!this.policy.enabled) throw new Error('FTP-Upload ist deaktiviert.'); if(this.policy.globalLock && this.db.scalar<string>('SELECT value FROM system_state WHERE key=\'upload:lock\'')) throw new Error('Globaler Upload-Lock ist aktiv.'); const latest=preflightUpload(request.sourcePath,request.targetPath,this.policy); if(latest.sha256!==request.sha256) throw new Error('Hash vor Upload geändert. Upload blockiert.'); if(this.policy.globalLock)this.db.run("INSERT INTO system_state(key,value,updated_at) VALUES('upload:lock',?,?)",[JSON.stringify({requestId,userId:request.approverUserId,startedAt:auditTime(),type:request.uploadType,target:request.targetPath}),auditTime()]); this.db.run("UPDATE upload_requests SET status='UPLOADING',started_at=? WHERE request_id=? AND status='APPROVED'",[auditTime(),requestId]); this.audit(request.guildId,request.channelId,requestId,request.approverUserId,'UPLOAD_STARTED'); try{await executor.uploadAtomic(request,{createBackup:this.policy.createRemoteBackup}); this.db.run("UPDATE upload_requests SET status='SUCCESS',finished_at=? WHERE request_id=? AND status='UPLOADING'",[auditTime(),requestId]); this.audit(request.guildId,request.channelId,requestId,request.approverUserId,'UPLOAD_SUCCESS');}catch(error){const message=error instanceof Error?error.message:'Unbekannter Uploadfehler'; this.db.run("UPDATE upload_requests SET status='FAILED',error_code='EXECUTOR_FAILED',error_message=?,finished_at=? WHERE request_id=?",[message,auditTime(),requestId]); this.audit(request.guildId,request.channelId,requestId,request.approverUserId,'UPLOAD_FAILED',message); if(executor.rollback){this.db.run("UPDATE upload_requests SET status='ROLLBACK',rollback_status='STARTED' WHERE request_id=?",[requestId]); try{await executor.rollback(request);this.db.run("UPDATE upload_requests SET status='FAILED',rollback_status='SUCCESS' WHERE request_id=?",[requestId]);this.audit(request.guildId,request.channelId,requestId,request.approverUserId,'ROLLBACK_SUCCESS');}catch(rollbackError){this.db.run("UPDATE upload_requests SET status='UNKNOWN',rollback_status='FAILED' WHERE request_id=?",[requestId]);this.audit(request.guildId,request.channelId,requestId,request.approverUserId,'ROLLBACK_FAILED',rollbackError instanceof Error?rollbackError.message:'Unbekannt');}} throw error;}finally{if(this.policy.globalLock)this.db.run("DELETE FROM system_state WHERE key='upload:lock'");}
  }
}
