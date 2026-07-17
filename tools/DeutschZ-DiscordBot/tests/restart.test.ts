import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { nextRestart } from '../src/services/restart.js';

const times = ['01:00','07:00','13:00','19:00'];

describe('Restart calculation', () => {
  it('selects the next restart after midnight', () => {
    const result = nextRestart(DateTime.fromISO('2026-07-17T00:30:00', {zone:'Europe/Berlin'}), times);
    expect(result.at.toFormat('HH:mm')).toBe('01:00');
  });

  it('rolls over to the next day', () => {
    const result = nextRestart(DateTime.fromISO('2026-07-17T23:59:00', {zone:'Europe/Berlin'}), times);
    expect(result.at.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-07-18 01:00');
  });

  it('keeps Europe/Berlin DST semantics in winter and summer', () => {
    const summer = nextRestart(DateTime.fromISO('2026-07-17T00:30:00', {zone:'Europe/Berlin'}), times);
    const winter = nextRestart(DateTime.fromISO('2026-01-17T00:30:00', {zone:'Europe/Berlin'}), times);
    expect(summer.at.offset).toBe(120);
    expect(winter.at.offset).toBe(60);
  });
});
