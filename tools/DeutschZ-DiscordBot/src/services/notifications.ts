import { EmbedBuilder, Guild } from 'discord.js';
import { DateTime } from 'luxon';
import { appConfig } from '../config.js';
import type { Database } from '../database.js';
import type { DayZStatus } from '../types.js';
import { nextRestart } from './restart.js';
import { storedTextChannel } from '../discord/panels.js';

export const notificationColors = { success:0x2ecc71, danger:0xe74c3c, warning:0xf1c40f, info:0x3498db, event:0x9b59b6, neutral:0x2b2d31 } as const;

export class NotificationService {
  constructor(private readonly db: Database) {}

  private state(key:string):string|undefined { return this.db.scalar<string>('SELECT value FROM system_state WHERE key=?',[key]); }
  private setState(key:string,value:string):void { this.db.run('INSERT INTO system_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',[key,value,new Date().toISOString()]); }

  async send(guild:Guild, options:{type:string;title:string;body:string;color:keyof typeof notificationColors;role?:string;dedupeKey?:string;channelName?:string}):Promise<boolean>{
    if(options.dedupeKey && this.db.scalar<number>('SELECT COUNT(*) FROM notification_log WHERE dedupe_key=?',[options.dedupeKey])) return false;
    const channel=storedTextChannel(guild,this.db,options.channelName??'📢・ankündigungen'); if(!channel) return false;
    const role=options.role?guild.roles.cache.find(item=>item.name===options.role):undefined;
    const message=await channel.send({content:role?`<@&${role.id}>`:undefined,embeds:[new EmbedBuilder().setColor(notificationColors[options.color]).setTitle(options.title).setDescription(options.body).setFooter({text:'☣️ DeutschZ – Überlebe nicht einfach. Hinterlasse deine Geschichte.'}).setTimestamp()],allowedMentions:{roles:role?[role.id]:[]}});
    if(options.dedupeKey) this.db.run('INSERT INTO notification_log(dedupe_key,type,channel_id,message_id,sent_at) VALUES(?,?,?,?,?)',[options.dedupeKey,options.type,channel.id,message.id,new Date().toISOString()]);
    return true;
  }

  async processServerStatus(guild:Guild,status:DayZStatus):Promise<void>{
    const last=this.state('dayz:lastState'); const failures=Number(this.state('dayz:failures')??0);
    if(status.state==='online'){
      this.setState('dayz:failures','0'); this.setState('dayz:lastState','online'); this.setState('dayz:lastSuccess',status.checkedAt);
      if(last==='offline'){
        const restart=nextRestart(DateTime.now(),appConfig.restartTimes,appConfig.TIMEZONE);
        await this.send(guild,{type:'server-online',title:'🟢 ┃ DEUTSCHZ IST WIEDER ONLINE',body:`Der Server ist wieder erreichbar und bereit für euren nächsten Einsatz.\n\n🌍 Map: ${status.map}\n👥 Slots: ${status.maxPlayers}\n🎮 Server: ${appConfig.DAYZ_SERVER_IP}:${appConfig.DAYZ_SERVER_PORT}\n🔄 Nächster Restart: ${restart.at.toFormat('HH:mm')} Uhr\n\n⚔️ Ausrüsten. Einsteigen. Überleben.`,color:'success',role:'Serverstatus-Ping',dedupeKey:`server-online:${status.checkedAt.slice(0,16)}`});
      }
    }else if(status.state==='offline'){
      const count=failures+1; this.setState('dayz:failures',String(count));
      if(count>=appConfig.STATUS_FAILURE_THRESHOLD && last!=='offline'){
        this.setState('dayz:lastState','offline'); await this.send(guild,{type:'server-offline',title:'🔴 ┃ SERVER DERZEIT NICHT ERREICHBAR',body:`DeutschZ antwortet nach ${count} bestätigten Prüfungen nicht.\n\n🧭 Das Team wurde automatisch informiert.\n🛠️ Bitte startet keine mehrfachen Support-Tickets.\n⏱️ Die nächste Prüfung läuft automatisch.`,color:'danger',role:'Serverstatus-Ping',dedupeKey:`server-offline:${DateTime.now().toFormat('yyyyLLddHH')}`});
      }
    }else{
      if(last!=='unknown') await this.send(guild,{type:'server-unknown',title:'🟡 ┃ STATUSABFRAGE NICHT VERFÜGBAR',body:`Der Bot kann den Serverstatus momentan nicht zuverlässig auslesen. Dies bedeutet nicht automatisch, dass der Server offline ist.\n\n🎮 Direktverbindung: ${appConfig.DAYZ_SERVER_IP}:${appConfig.DAYZ_SERVER_PORT}`,color:'warning',dedupeKey:`server-unknown:${DateTime.now().toFormat('yyyyLLdd')}`});
    }
  }

  getState(key:string):string|undefined { return this.state(key); }

  async announce(guild:Guild,title:string,body:string,role?:string,channelName?:string):Promise<boolean>{
    return this.send(guild,{type:'announcement',title:`📢 ┃ ${title.toUpperCase()}`,body,color:'info',role,channelName});
  }

  async maintenance(guild:Guild,phase:'planned'|'started'|'completed',detail:string):Promise<boolean>{
    const values={
      planned:{title:'🛠️ ┃ GEPLANTE WARTUNG',color:'warning' as const},
      started:{title:'🔧 ┃ WARTUNG GESTARTET',color:'danger' as const},
      completed:{title:'✅ ┃ WARTUNG ABGESCHLOSSEN',color:'success' as const}
    }[phase];
    this.setState('maintenance:state',phase);
    return this.send(guild,{type:`maintenance-${phase}`,title:values.title,body:detail,color:values.color,role:'Wartungs-Ping'});
  }

  async kothz(guild:Guild,status:'announce'|'active'|'progress'|'won',body:string):Promise<boolean>{
    const title={announce:'⚔️ ┃ KOTHZ-EVENT ANGEKÜNDIGT',active:'🚩 ┃ KOTHZ-EVENT AKTIV',progress:'📊 ┃ KOTHZ CAPTURE LÄUFT',won:'🏆 ┃ KOTHZ ERFOLGREICH ABGESCHLOSSEN'}[status];
    return this.send(guild,{type:`kothz-${status}`,title,body,color:'event',role:'KotHZ-Ping',channelName:'🎉・event-ankündigungen'});
  }

  async giveaway(guild:Guild,body:string):Promise<boolean>{
    return this.send(guild,{type:'giveaway',title:'🎁 ┃ GIVEAWAY BEENDET',body,color:'event',role:'Giveaway-Ping'});
  }

  async modUpdate(guild:Guild,body:string):Promise<boolean>{
    return this.send(guild,{type:'mod-update',title:'🧩 ┃ MODLISTE AKTUALISIERT',body,color:'info',role:'Update-Ping'});
  }

  async raidAlert(guild:Guild,joins:number,youngAccounts:number):Promise<boolean>{
    const bucket=DateTime.now().toFormat('yyyyLLddHHmm');
    return this.send(guild,{type:'raid-alert',title:'🚨 ┃ MÖGLICHER RAID ERKANNT',body:`Der Bot hat ungewöhnliche Beitrittsaktivität festgestellt.\n\n👥 Neue Mitglieder: ${joins}\n⏱️ Zeitraum: 60 Sekunden\n🆕 Junge Accounts: ${youngAccounts}\n\n🛡️ Empfohlene Aktion: Verifizierung und Schreibrechte prüfen. Der Bot hat keine permanenten Bans ausgeführt.`,color:'danger',dedupeKey:`raid:${bucket}`,channelName:'🤖・bot-logs'});
  }

  async setRaidMode(guild:Guild,enabled:boolean,actorId:string):Promise<boolean>{
    this.setState('raid:mode',enabled?'on':'off');
    return this.send(guild,{type:'raid-mode',title:enabled?'🔒 ┃ RAID-MODUS AKTIVIERT':'🔓 ┃ RAID-MODUS DEAKTIVIERT',body:`Status: **${enabled?'AKTIV':'INAKTIV'}**\n👤 Geändert durch: <@${actorId}>\n\nEs wurden keine automatischen permanenten Bans ausgeführt.`,color:enabled?'warning':'success',channelName:'🤖・bot-logs'});
  }
}
