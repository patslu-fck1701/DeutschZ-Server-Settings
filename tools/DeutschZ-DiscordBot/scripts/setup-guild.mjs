import { Client, GatewayIntentBits } from 'discord.js';
import { appConfig } from '../dist/config.js';
import { Database } from '../dist/database.js';
import { DayZStatusService } from '../dist/services/dayz-status.js';
import { deutschzCategorySpecs, deutschzRoleSpecs, reconcileGuild } from '../dist/discord/setup.js';
import { publishEventList, publishLinks, publishModList, publishRoles, publishRules, publishServerPanels, publishTickets, publishVerification, publishWelcome, publishWorkshopLinks, storedTextChannel } from '../dist/discord/panels.js';

if(!appConfig.discordReady) throw new Error('Discord-Konfiguration fehlt.');
const db=await Database.open();
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers]});
try{
  await client.login(appConfig.DISCORD_TOKEN);
  const guild=client.guilds.cache.get(appConfig.DISCORD_GUILD_ID);
  if(!guild)throw new Error('Konfigurierte Guild ist nicht sichtbar.');
  const changes=await reconcileGuild(guild,db);
  await guild.channels.fetch();
  const jobs=[];
  const call=(name,fn)=>{const channel=storedTextChannel(guild,db,name);if(channel)jobs.push(fn(channel,db));};
  call('👋・willkommen',publishWelcome); call('📜・regelwerk',publishRules); call('✅・verifizierung',publishVerification); call('🎭・rollenwahl',publishRoles); call('🎫・ticket-erstellen',publishTickets); call('🧩・modliste',publishModList); call('🎉・event-ankündigungen',publishEventList); call('🌐・links',publishLinks); call('📦・workshop-links',publishWorkshopLinks);
  const server=storedTextChannel(guild,db,'🗺️・server-informationen');if(server)jobs.push(publishServerPanels(server,db,await new DayZStatusService().query(true)));
  await Promise.all(jobs);
  await guild.channels.fetch(); await guild.roles.fetch();
  const desiredCategories=new Set(Object.keys(deutschzCategorySpecs));
  const desiredByCategory=new Map(Object.entries(deutschzCategorySpecs).map(([category,channels])=>[category,new Set(channels.map(([name])=>name))]));
  const extraCategories=[]; const extraChannels=[];
  for(const channel of guild.channels.cache.values()){
    if(channel.type===4){if(!desiredCategories.has(channel.name))extraCategories.push({id:channel.id,name:channel.name});continue;}
    const parent=channel.parent;
    if(!parent||!desiredCategories.has(parent.name)){extraChannels.push({id:channel.id,name:channel.name,parent:parent?.name??null,type:channel.type});continue;}
    if(!desiredByCategory.get(parent.name)?.has(channel.name))extraChannels.push({id:channel.id,name:channel.name,parent:parent.name,type:channel.type});
  }
  const desiredRoles=new Set(deutschzRoleSpecs.map(([name])=>name));
  const extraRoles=[...guild.roles.cache.values()].filter(role=>!role.managed&&role.name!=='@everyone'&&!desiredRoles.has(role.name)).map(role=>({id:role.id,name:role.name,members:role.members.size}));
  const result={guildId:guild.id,guildName:guild.name,changes,publishedPanels:jobs.length,extraCategories,extraChannels,extraRoles};
  console.log(`DEUTSCHZ_SETUP_RESULT=${Buffer.from(JSON.stringify(result),'utf8').toString('base64')}`);
}finally{client.destroy();db.close();}
