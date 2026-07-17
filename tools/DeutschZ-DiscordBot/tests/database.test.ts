import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Database } from '../src/database.js';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => fs.rmSync(dir, {recursive:true,force:true})));

describe('database', () => {
  it('migrates, seeds and persists without recreating data', async () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deutschz-db-')); dirs.push(dir); const file=path.join(dir,'bot.sqlite');
    const db=await Database.open(file); expect(db.listMods()).toContain('@DeutschZ_only_core'); db.addMod('@DeutschZ_Test'); db.close();
    const reopened=await Database.open(file); expect(reopened.listMods().filter(name=>name==='@DeutschZ_Test')).toHaveLength(1); reopened.close();
  });
});
