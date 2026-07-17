import { GameDig } from 'gamedig';
import { appConfig } from '../config.js';
import type { DayZStatus } from '../types.js';

export class DayZStatusService {
  private cached: DayZStatus | null = null;
  private pending: Promise<DayZStatus> | null = null;
  private failureCount = 0;

  async query(force = false): Promise<DayZStatus> {
    const maxAge = appConfig.DAYZ_STATUS_INTERVAL_SECONDS * 1000;
    if (!force && this.cached && Date.now() - Date.parse(this.cached.checkedAt) < maxAge) return { ...this.cached, source: 'cache' };
    if (this.pending) return this.pending;
    this.pending = this.perform().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async perform(): Promise<DayZStatus> {
    const now = new Date();
    const queryPort = appConfig.DAYZ_QUERY_PORT ?? appConfig.DAYZ_SERVER_PORT;
    try {
      const state = await GameDig.query({ type: 'dayz', host: appConfig.DAYZ_SERVER_IP, port: queryPort, maxAttempts: 1, socketTimeout: 5000 });
      this.failureCount = 0;
      this.cached = {
        state: 'online', players: state.players.length, maxPlayers: state.maxplayers || appConfig.DAYZ_MAX_PLAYERS,
        name: state.name || appConfig.SERVER_NAME, map: state.map || appConfig.DAYZ_MAP,
        ping: typeof state.ping === 'number' ? state.ping : null, checkedAt: now.toISOString(),
        lastSuccessAt: now.toISOString(), nextCheckAt: new Date(now.getTime() + appConfig.DAYZ_STATUS_INTERVAL_SECONDS * 1000).toISOString(),
        source: 'a2s'
      };
    } catch {
      this.failureCount += 1;
      const queryExplicit = appConfig.DAYZ_QUERY_PORT !== undefined;
      const nextSeconds = Math.min(appConfig.DAYZ_STATUS_INTERVAL_SECONDS * (2 ** Math.min(this.failureCount - 1, 4)), 900);
      this.cached = {
        state: queryExplicit ? 'offline' : 'unknown', players: this.cached?.players ?? null,
        maxPlayers: appConfig.DAYZ_MAX_PLAYERS, name: this.cached?.name ?? appConfig.SERVER_NAME,
        map: this.cached?.map ?? appConfig.DAYZ_MAP, ping: null, checkedAt: now.toISOString(),
        lastSuccessAt: this.cached?.lastSuccessAt ?? null, nextCheckAt: new Date(now.getTime() + nextSeconds * 1000).toISOString(),
        source: 'unavailable', error: queryExplicit ? 'A2S-Abfrage fehlgeschlagen' : 'DAYZ_QUERY_PORT nicht bestätigt'
      };
    }
    return this.cached;
  }
}
