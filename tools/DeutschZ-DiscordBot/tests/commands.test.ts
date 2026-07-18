import { describe, expect, it } from 'vitest';
import { commandData } from '../src/discord/commands.js';

const publicCommands = new Set([
  'bot-status','mods','restart-next','github-status','github-latest','github-links','suggest',
  'markt','musik','team','unterstuetzen'
]);

describe('slash command security audit', () => {
  it('contains no duplicate command names', () => {
    const names = commandData.map(command => command.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('only exposes the reviewed public command allowlist', () => {
    const actual = commandData.filter(command => command.default_member_permissions === undefined).map(command => command.name).sort();
    expect(actual).toEqual([...publicCommands].sort());
  });

  it('has complete names and help descriptions', () => {
    for (const command of commandData) {
      expect(command.name).toMatch(/^[a-z0-9-]{1,32}$/);
      expect(command.description.trim().length).toBeGreaterThanOrEqual(8);
      for (const option of command.options ?? []) {
        expect(option.description.trim().length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('keeps FTP commands permission-gated', () => {
    for (const name of ['upload','deploy','push-settings','push-mod','push-file']) {
      expect(commandData.find(command => command.name === name)?.default_member_permissions).toBeDefined();
    }
  });
});
