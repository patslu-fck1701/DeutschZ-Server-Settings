import { describe, expect, it } from 'vitest';
import { safeConfigStatus } from '../src/config.js';

describe('safe config', () => {
  it('never returns a token value', () => {
    const status=safeConfigStatus();
    expect(['gesetzt','fehlt']).toContain(status.DISCORD_TOKEN);
    expect(JSON.stringify(status)).not.toMatch(/Bot\s+[A-Za-z0-9._-]{20,}/);
  });
});
