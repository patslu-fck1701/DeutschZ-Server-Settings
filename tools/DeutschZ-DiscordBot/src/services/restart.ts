import { DateTime } from 'luxon';

export interface RestartResult {
  at: DateTime;
  key: string;
  label: string;
}

export function nextRestart(now: DateTime, times: string[], zone = 'Europe/Berlin'): RestartResult {
  const local = now.setZone(zone);
  const candidates: DateTime[] = [];
  for (const dayOffset of [0, 1]) {
    const day = local.plus({ days: dayOffset }).startOf('day');
    for (const time of times) {
      const [hour, minute] = time.split(':').map(Number);
      if (!Number.isInteger(hour) || !Number.isInteger(minute)) continue;
      const candidate = day.set({ hour, minute, second: 0, millisecond: 0 });
      if (candidate > local) candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => a.toMillis() - b.toMillis());
  const at = candidates[0];
  if (!at) throw new Error('Keine gültige Restart-Zeit konfiguriert.');
  return {
    at,
    key: at.toUTC().toISO()!,
    label: at.toFormat('dd.LL.yyyy HH:mm ZZZZ')
  };
}

export function restartChannelName(result: RestartResult): string {
  return `🔄・restart-${result.at.toFormat('HH-mm')}`;
}
