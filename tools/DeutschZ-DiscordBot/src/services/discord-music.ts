import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  AudioPlayer, AudioPlayerStatus, createAudioPlayer, createAudioResource, entersState,
  joinVoiceChannel, NoSubscriberBehavior, VoiceConnection, VoiceConnectionStatus
} from '@discordjs/voice';
import type { GuildMember } from 'discord.js';
import { appConfig } from '../config.js';

const ffmpegPath = createRequire(import.meta.url)('ffmpeg-static') as string | null;

interface GuildMusicState {
  connection: VoiceConnection;
  player: AudioPlayer;
  playlist: string[];
  currentIndex: number;
  muted: boolean;
}

export class DiscordMusicService {
  private readonly states = new Map<string, GuildMusicState>();

  constructor() {
    if (ffmpegPath) process.env.PATH = `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH ?? ''}`;
  }

  list(): string[] {
    if (!fs.existsSync(appConfig.DISCORD_MUSIC_DIRECTORY)) return [];
    return fs.readdirSync(appConfig.DISCORD_MUSIC_DIRECTORY)
      .filter(file => file.toLowerCase().endsWith('.mp3'))
      .sort((a, b) => a.localeCompare(b, 'de'));
  }

  current(guildId: string): string | undefined {
    const state = this.states.get(guildId);
    return state ? state.playlist[state.currentIndex] : undefined;
  }

  async play(member: GuildMember, requestedTitle?: string): Promise<string> {
    const channel = member.voice.channel;
    if (!channel) throw new Error('Du musst in einem Sprachkanal sein.');
    const playlist = this.list();
    if (!playlist.length) throw new Error('Keine freigegebenen DeutschZ-MP3-Dateien gefunden.');
    let index = requestedTitle ? playlist.findIndex(file => file.toLowerCase().includes(requestedTitle.toLowerCase())) : -1;
    if (requestedTitle && index < 0) throw new Error('Der gewünschte Titel wurde nicht gefunden. Nutze /musik liste.');
    if (index < 0) index = Math.floor(Math.random() * playlist.length);

    let state = this.states.get(member.guild.id);
    if (!state) {
      const connection = joinVoiceChannel({ channelId: channel.id, guildId: member.guild.id, adapterCreator: member.guild.voiceAdapterCreator, selfDeaf: true });
      await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
      const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
      connection.subscribe(player);
      state = { connection, player, playlist, currentIndex: index, muted: false };
      this.states.set(member.guild.id, state);
      player.on(AudioPlayerStatus.Idle, () => this.next(member.guild.id).catch(() => this.stop(member.guild.id)));
    } else {
      state.playlist = playlist;
      state.currentIndex = index;
    }
    this.startResource(state);
    return playlist[index]!;
  }

  async next(guildId: string): Promise<string> {
    const state = this.states.get(guildId);
    if (!state) throw new Error('Aktuell läuft keine DeutschZ-Musik.');
    if (state.playlist.length > 1) {
      let next = state.currentIndex;
      while (next === state.currentIndex) next = Math.floor(Math.random() * state.playlist.length);
      state.currentIndex = next;
    }
    this.startResource(state);
    return state.playlist[state.currentIndex]!;
  }

  togglePause(guildId: string): boolean {
    const state = this.states.get(guildId);
    if (!state) throw new Error('Aktuell läuft keine DeutschZ-Musik.');
    if (state.player.state.status === AudioPlayerStatus.Paused || state.player.state.status === AudioPlayerStatus.AutoPaused) {
      state.player.unpause();
      return false;
    }
    state.player.pause();
    return true;
  }

  toggleMute(guildId: string): boolean {
    const state = this.states.get(guildId);
    if (!state) throw new Error('Aktuell läuft keine DeutschZ-Musik.');
    state.muted = !state.muted;
    const resource = state.player.state.status === AudioPlayerStatus.Playing || state.player.state.status === AudioPlayerStatus.Paused || state.player.state.status === AudioPlayerStatus.AutoPaused ? state.player.state.resource : undefined;
    resource?.volume?.setVolume(state.muted ? 0 : 0.45);
    return state.muted;
  }

  stop(guildId: string): void {
    const state = this.states.get(guildId);
    if (!state) return;
    state.player.stop(true);
    state.connection.destroy();
    this.states.delete(guildId);
  }

  stopAll(): void {
    for (const guildId of [...this.states.keys()]) this.stop(guildId);
  }

  private startResource(state: GuildMusicState): void {
    const file = path.join(appConfig.DISCORD_MUSIC_DIRECTORY, state.playlist[state.currentIndex]!);
    const resource = createAudioResource(file, { inlineVolume: true });
    resource.volume?.setVolume(state.muted ? 0 : 0.45);
    state.player.play(resource);
  }
}
