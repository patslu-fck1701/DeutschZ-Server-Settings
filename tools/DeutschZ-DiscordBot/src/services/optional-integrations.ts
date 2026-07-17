import { appConfig } from '../config.js';

export interface Announcement { title: string; body: string; url?: string; approvedBy?: string; }

export class SocialAnnouncementService {
  readonly enabled = appConfig.SOCIAL_ENABLED;
  async publish(_announcement: Announcement): Promise<{published:false; reason:string}> {
    return { published: false, reason: this.enabled ? 'Keine offizielle Plattform-API konfiguriert.' : 'SOCIAL_ENABLED=false' };
  }
}

export class KillfeedService {
  readonly enabled = appConfig.KILLFEED_ENABLED;
  status(): string {
    return this.enabled ? 'aktiviert, aber keine zulässige Logquelle konfiguriert' : 'deaktiviert';
  }
}
