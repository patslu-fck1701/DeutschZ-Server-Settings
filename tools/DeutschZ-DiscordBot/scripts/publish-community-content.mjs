import { AttachmentBuilder, ChannelType, Client, EmbedBuilder, GatewayIntentBits } from 'discord.js';
import { existsSync } from 'node:fs';
import { appConfig } from '../dist/config.js';

if (!appConfig.discordReady) throw new Error('Discord-Konfiguration fehlt.');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const assets = {
  shield: 'C:\\Users\\patsl\\Downloads\\66b7fcf8-490c-49fb-9757-42f4a0bc1466.png',
  flag: 'C:\\Users\\patsl\\Downloads\\1fdb3ccd-fcd2-417a-b882-2e4234d91395.png',
  halftan: 'E:\\DeutschZ\\PAAs\\UserBilder\\Halftan_DayZ_Survivor.png',
  patrick: 'E:\\DeutschZ\\PAAs\\UserBilder\\fck1701_DayZ_Military.png',
  devil: 'E:\\DeutschZ\\PAAs\\UserBilder\\DevilMagic_DayZ_Survivor.png',
  event: [
    'C:\\Users\\patsl\\Downloads\\DeutschZ Event-Hintergründe AirdrpZ.png',
    'C:\\Users\\patsl\\Downloads\\DeutschZ Event-Hintergründe HelicrashZ.png',
    'C:\\Users\\patsl\\Downloads\\DeutschZ Event-Hintergründe BunkerZ.png',
    'C:\\Users\\patsl\\Downloads\\DeutschZ Event-Hintergründe ConvoyZ.png'
  ],
  zombies: [
    'C:\\Users\\patsl\\Downloads\\DeutschZ Asset Pack – Zombie 1.png',
    'C:\\Users\\patsl\\Downloads\\DeutschZ Asset Pack – Zombie 2.png',
    'C:\\Users\\patsl\\Downloads\\DeutschZ Asset Pack – Zombie 3.png',
    'C:\\Users\\patsl\\Downloads\\DeutschZ Asset Pack – Zombie 4.png',
    'C:\\Users\\patsl\\Downloads\\DeutschZ Asset Pack – Zombie 5.png',
    'C:\\Users\\patsl\\Downloads\\DeutschZ Asset Pack – Zombie Mummy.png'
  ]
};

const marker = key => `DEUTSCHZ CONTENT · ${key} · V1`;
const findChannel = (guild, name) => guild.channels.cache.find(channel => channel.name === name && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement));

async function publishOnce(channel, key, payload, pin = false) {
  if (!channel) return false;
  const recent = await channel.messages.fetch({ limit: 100 });
  if (recent.some(message => message.content.includes(marker(key)))) return false;
  const message = await channel.send({ ...payload, content: `${marker(key)}\n${payload.content ?? ''}`.trim() });
  if (pin) await message.pin(`DeutschZ ${key}`).catch(() => undefined);
  return true;
}

try {
  await client.login(appConfig.DISCORD_TOKEN);
  const guild = client.guilds.cache.get(appConfig.DISCORD_GUILD_ID);
  if (!guild) throw new Error('Guild ist nicht sichtbar.');
  await guild.channels.fetch();
  const published = [];

  const announcement = findChannel(guild, '📢・ankündigungen');
  if (await publishOnce(announcement, 'NEUSTART-20260718', {
    content: '@everyone',
    allowedMentions: { parse: ['everyone'] },
    embeds: [new EmbedBuilder().setColor(0x68a800).setTitle('🚀 DeutschZ Discord neu geordnet').setDescription('Die DeutschZ-Bereiche sind neu strukturiert und eindeutig befüllt. Neu bzw. aktualisiert sind Schildwall und Teamvorstellung, Live-Marktübersicht, DeutschZ-Musik, freiwillige Unterstützung, Eventmedien sowie der abgesicherte FTP-Freigabeablauf.\n\nBitte lest die angepinnten Kanalinformationen. Kritische Änderungen werden ausschließlich über feste Discord-IDs und protokollierte Freigaben abgesichert.')]
  }, true)) published.push('announcement');

  const shield = findChannel(guild, '🛡️・schildwall');
  if (existsSync(assets.shield) && await publishOnce(shield, 'SCHILDWALL', {
    files: [new AttachmentBuilder(assets.shield, { name: 'DeutschZ_Schildwall.png' })],
    embeds: [new EmbedBuilder().setColor(0x68a800).setTitle('🛡️ DeutschZ Schildwall').setDescription(`**Patrick Sluzalek / fck1701** · Inhaber & Projektleitung\n**Halftan** · Mitgründer & Hauptfreigeber\n**DevilMagic** · Administration & Hauptfreigeber\n\n🏅 **Ronny1996 (GHOST)** und **Tschuby** unterstützen DeutschZ als Spezial-Ehrenmitglieder und Supporter mit Spielerhilfe, Tests und Feedback.`).setImage('attachment://DeutschZ_Schildwall.png')]
  }, true)) published.push('shieldwall');
  if (existsSync(assets.flag) && await publishOnce(shield, 'SCHILDWALL-FLAG', {
    files: [new AttachmentBuilder(assets.flag, { name: 'DeutschZ_Schildwall_Flagge.png' })],
    embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('Gemeinsam für DeutschZ').setDescription('Ein Server. Eine Community. Gemeinsame Verantwortung.').setImage('attachment://DeutschZ_Schildwall_Flagge.png')]
  })) published.push('shieldwall-flag');

  const team = findChannel(guild, '👥・team-vorstellung');
  const people = [
    ['PATRICK', assets.patrick, 'Patrick_Sluzalek.png', 'Patrick Sluzalek · fck1701', 'Inhaber, Projektleitung und letzte Entscheidungsinstanz.'],
    ['HALFTAN', assets.halftan, 'Halftan.png', 'Halftan', 'Mitgründer und Hauptfreigeber. Besonderer Dank für seine Hilfe und Unterstützung bei der Umsetzung der DeutschZ-Ideen.'],
    ['DEVIL', assets.devil, 'DevilMagic.png', 'DevilMagic', 'Administration und Hauptfreigeber. Besonderer Dank für seine Hilfe und Unterstützung bei der Umsetzung der DeutschZ-Ideen.']
  ];
  for (const [key, file, name, title, description] of people) {
    if (!existsSync(file)) continue;
    if (await publishOnce(team, `TEAM-${key}`, { files: [new AttachmentBuilder(file, { name })], embeds: [new EmbedBuilder().setColor(0x68a800).setTitle(title).setDescription(description).setImage(`attachment://${name}`)] }, key === 'PATRICK')) published.push(`team-${key.toLowerCase()}`);
  }

  const donation = findChannel(guild, '❤️・unterstützen');
  if (await publishOnce(donation, 'SPENDEN', { embeds: [new EmbedBuilder().setColor(0x68a800).setTitle('❤️ DeutschZ unterstützen').setDescription(`Dir gefällt der Server und du möchtest die Weiterentwicklung von DeutschZ unterstützen? Mit einer freiwilligen Spende hilfst du bei Serverkosten, Events, Mods, Grafiken, Sounds und Erweiterungen.\n\nEine Spende ist freiwillig und verschafft **keine unfairen spielerischen Vorteile**.\n\n🔗 [Jetzt freiwillig unterstützen](${appConfig.DONATION_URL})\n\nVielen Dank an alle, die DeutschZ gemeinsam mit uns voranbringen. 🖤💚`)] }, true)) published.push('donation');

  const music = findChannel(guild, '🎵・deutschz-musik');
  if (await publishOnce(music, 'MUSIK', { embeds: [new EmbedBuilder().setColor(0x68a800).setTitle('🎵 DeutschZ Musik').setDescription('Die freigegebene DeutschZ-Playlist kann im Sprachkanal über `/musik play` gestartet werden.\n\n`/musik liste` · Titel anzeigen\n`/musik play` · zufällig starten\n`/musik pause` · pausieren/fortsetzen\n`/musik next` · nächster Titel\n`/musik mute` · stumm/an\n`/musik stop` · beenden\n\nDie Wiedergabe ist auf 45 % begrenzt.') ] }, true)) published.push('music');

  const market = findChannel(guild, '🛒・markt');
  if (await publishOnce(market, 'MARKT', { embeds: [new EmbedBuilder().setColor(0x68a800).setTitle('🛒 DeutschZ Live-Markt').setDescription('Der Bot liest die aktuellen Expansion-Market- und Händlerdateien ausschließlich lesend ein.\n\n`/markt uebersicht` · Marktübersicht\n`/markt kategorien` · Kategorien\n`/markt suche` · Artikel suchen\n`/markt artikel` · ClassName prüfen\n`/markt kategorie` · Kategorie samt Händlerzuordnung\n\nAktueller technischer Import: **92 Kategorien · 2.609 Artikel · 24 Händler**.') ] }, true)) published.push('market');

  const eventMedia = findChannel(guild, '🎬・event-medien');
  for (const [index, file] of assets.event.entries()) {
    if (!existsSync(file)) continue;
    const name = `DeutschZ_Event_${index + 1}.png`;
    if (await publishOnce(eventMedia, `EVENTART-${index + 1}`, { files: [new AttachmentBuilder(file, { name })], embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('DeutschZ Event-Artwork').setDescription('Motiv für Eventankündigungen, Website und spätere Loading-Screen-Auswahl.').setImage(`attachment://${name}`)] })) published.push(`event-${index + 1}`);
  }
  for (const [index, file] of assets.zombies.entries()) {
    if (!existsSync(file)) continue;
    const name = `DeutschZ_Infected_${index + 1}.png`;
    if (await publishOnce(eventMedia, `INFECTED-${index + 1}`, { files: [new AttachmentBuilder(file, { name })], embeds: [new EmbedBuilder().setColor(0x2b2d31).setTitle('DeutschZ Infected Asset').setDescription('Freigegebenes Motiv für Website, Eventdarstellung und Community-Medien.').setImage(`attachment://${name}`)] })) published.push(`infected-${index + 1}`);
  }

  process.stdout.write(JSON.stringify({ guild: guild.name, published }));
} finally {
  client.destroy();
}
