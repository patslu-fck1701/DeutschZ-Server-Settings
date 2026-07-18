import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits
} from 'discord.js';
import { appConfig } from '../dist/config.js';
import { Database } from '../dist/database.js';
import { deutschzCategorySpecs, deutschzRoleSpecs, reconcileGuild } from '../dist/discord/setup.js';
import {
  publishEventList,
  publishLinks,
  publishModList,
  publishRoles,
  publishRules,
  publishServerPanels,
  publishTickets,
  publishVerification,
  publishWelcome,
  publishWorkshopLinks,
  storedTextChannel
} from '../dist/discord/panels.js';
import { DayZStatusService } from '../dist/services/dayz-status.js';

const CONFIRMATION = 'RESET-DEUTSCHZ-CHANNELS-AND-ROLES';
const confirmationIndex = process.argv.indexOf('--confirm');
const confirmation = confirmationIndex >= 0 ? process.argv[confirmationIndex + 1] : undefined;
if (confirmation !== CONFIRMATION) {
  throw new Error(`Abbruch: --confirm ${CONFIRMATION} fehlt.`);
}
if (!appConfig.discordReady) throw new Error('Discord-Konfiguration fehlt.');

const sleep = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
const db = await Database.open();
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

function snapshot(guild) {
  return {
    capturedAt: new Date().toISOString(),
    guildId: guild.id,
    guildName: guild.name,
    channels: [...guild.channels.cache.values()].map(channel => ({
      id: channel.id,
      name: channel.name,
      type: channel.type,
      parentId: channel.parentId ?? null,
      position: channel.rawPosition,
      permissionOverwrites: channel.permissionOverwrites?.cache.map(overwrite => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString()
      })) ?? []
    })),
    roles: [...guild.roles.cache.values()].map(role => ({
      id: role.id,
      name: role.name,
      position: role.position,
      managed: role.managed,
      permissions: role.permissions.bitfield.toString(),
      memberCount: role.members.size
    }))
  };
}

function duplicateNames(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    if (seen.has(item.name)) duplicates.add(item.name);
    seen.add(item.name);
  }
  return [...duplicates];
}

try {
  await client.login(appConfig.DISCORD_TOKEN);
  const guild = client.guilds.cache.get(appConfig.DISCORD_GUILD_ID);
  if (!guild) throw new Error('Konfigurierte Guild ist nicht sichtbar.');
  await guild.channels.fetch();
  await guild.roles.fetch();
  await guild.members.fetch();

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Bot hat kein ManageChannels.');
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) throw new Error('Bot hat kein ManageRoles.');

  const auditDirectory = resolve('data', 'discord-reset-audit');
  await mkdir(auditDirectory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const beforePath = resolve(auditDirectory, `${stamp}-before.json`);
  await writeFile(beforePath, JSON.stringify(snapshot(guild), null, 2), 'utf8');

  const deletedChannels = [];
  const protectedCommunityChannels = [];
  const channelErrors = [];
  const currentChannels = [...guild.channels.cache.values()]
    .sort((left, right) => Number(left.type === ChannelType.GuildCategory) - Number(right.type === ChannelType.GuildCategory));
  for (const channel of currentChannels) {
    try {
      await channel.delete('Vom DeutschZ-Inhaber freigegebener vollständiger Discord-Neuaufbau');
      deletedChannels.push(`${channel.id}:${channel.name}`);
      await sleep(175);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('required for community servers') && channel.type === ChannelType.GuildText) {
        protectedCommunityChannels.push(channel);
      } else {
        channelErrors.push(`${channel.id}:${channel.name}:${message}`);
      }
    }
  }
  if (channelErrors.length) throw new Error(`Nicht alle Channels löschbar: ${channelErrors.join(' | ')}`);
  const protectedNames = ['👋・willkommen', '📜・regelwerk'];
  for (let index = 0; index < protectedCommunityChannels.length; index += 1) {
    const channel = protectedCommunityChannels[index];
    const desiredName = protectedNames[index];
    if (!desiredName) throw new Error(`Unerwarteter zusätzlicher Community-Pflichtkanal: ${channel.name}`);
    await channel.setName(desiredName, 'Community-Pflichtkanal wird in DeutschZ-Struktur übernommen');
    if (channel.parentId) await channel.setParent(null, { lockPermissions: false });
  }

  await guild.roles.fetch();
  const deletedRoles = [];
  const preservedRoles = [];
  const roleErrors = [];
  const removableRoles = [...guild.roles.cache.values()]
    .filter(role => role.name !== '@everyone' && !role.managed)
    .sort((left, right) => right.position - left.position);
  for (const role of removableRoles) {
    if (!role.editable) {
      preservedRoles.push(`${role.id}:${role.name}:nicht-editierbar`);
      continue;
    }
    try {
      await role.delete('Vom DeutschZ-Inhaber freigegebener vollständiger Rollen-Neuaufbau');
      deletedRoles.push(`${role.id}:${role.name}`);
      await sleep(175);
    } catch (error) {
      roleErrors.push(`${role.id}:${role.name}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (roleErrors.length) throw new Error(`Nicht alle editierbaren Rollen löschbar: ${roleErrors.join(' | ')}`);

  await guild.channels.fetch();
  await guild.roles.fetch();
  const changes = await reconcileGuild(guild, db);
  await guild.channels.fetch();

  const jobs = [];
  const publish = (name, job) => {
    const channel = storedTextChannel(guild, db, name);
    if (channel) jobs.push(job(channel, db));
  };
  publish('👋・willkommen', publishWelcome);
  publish('📜・regelwerk', publishRules);
  publish('✅・verifizierung', publishVerification);
  publish('🎭・rollenwahl', publishRoles);
  publish('🎫・ticket-erstellen', publishTickets);
  publish('🧩・modliste', publishModList);
  publish('🎉・event-ankündigungen', publishEventList);
  publish('🌐・links', publishLinks);
  publish('📦・workshop-links', publishWorkshopLinks);
  const serverInfo = storedTextChannel(guild, db, '🗺️・server-informationen');
  if (serverInfo) jobs.push(publishServerPanels(serverInfo, db, await new DayZStatusService().query(true)));
  await Promise.all(jobs);

  await guild.channels.fetch();
  await guild.roles.fetch();
  const expectedCategories = new Set(Object.keys(deutschzCategorySpecs));
  const expectedChannelKeys = new Set(Object.entries(deutschzCategorySpecs)
    .flatMap(([categoryName, channels]) => channels.map(([channelName]) => `${categoryName}/${channelName}`)));
  const actualCategories = [...guild.channels.cache.values()].filter(channel => channel.type === ChannelType.GuildCategory);
  const actualChannels = [...guild.channels.cache.values()].filter(channel => channel.type !== ChannelType.GuildCategory);
  const actualChannelKeys = new Set(actualChannels.map(channel => `${channel.parent?.name ?? 'OHNE KATEGORIE'}/${channel.name}`));
  const actualRoles = [...guild.roles.cache.values()].filter(role => role.name !== '@everyone' && !role.managed);
  const expectedRoles = new Set(deutschzRoleSpecs.map(([name]) => name));
  const verification = {
    missingCategories: [...expectedCategories].filter(name => !actualCategories.some(category => category.name === name)),
    extraCategories: actualCategories.filter(category => !expectedCategories.has(category.name)).map(category => category.name),
    missingChannels: [...expectedChannelKeys].filter(key => !actualChannelKeys.has(key)),
    extraChannels: [...actualChannelKeys].filter(key => !expectedChannelKeys.has(key)),
    duplicateCategoryNames: duplicateNames(actualCategories),
    duplicateChannelNames: duplicateNames(actualChannels),
    duplicateRoleNames: duplicateNames(actualRoles),
    missingRoles: [...expectedRoles].filter(name => !actualRoles.some(role => role.name === name)),
    extraRoles: actualRoles.filter(role => !expectedRoles.has(role.name)).map(role => role.name)
  };
  const clean = Object.values(verification).every(value => value.length === 0);
  const result = {
    guildId: guild.id,
    guildName: guild.name,
    beforeAudit: beforePath,
    deletedChannelCount: deletedChannels.length,
    protectedCommunityChannels: protectedCommunityChannels.map(channel => `${channel.id}:${channel.name}`),
    deletedRoleCount: deletedRoles.length,
    preservedRoles,
    setupChanges: changes,
    publishedPanels: jobs.length,
    finalCategoryCount: actualCategories.length,
    finalChannelCount: actualChannels.length,
    finalCustomRoleCount: actualRoles.length,
    verification,
    clean
  };
  const afterPath = resolve(auditDirectory, `${stamp}-after.json`);
  await writeFile(afterPath, JSON.stringify({ ...result, snapshot: snapshot(guild) }, null, 2), 'utf8');
  console.log(`DEUTSCHZ_RESET_RESULT=${Buffer.from(JSON.stringify(result), 'utf8').toString('base64')}`);
  if (!clean) process.exitCode = 2;
} finally {
  client.destroy();
  db.close();
}
