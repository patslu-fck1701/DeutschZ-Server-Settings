import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from '../config.js';
import type { Database } from '../database.js';

export function createBackup(db: Database): string {
  fs.mkdirSync(appConfig.BACKUP_DIRECTORY, { recursive: true });
  db.save();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.resolve(appConfig.BACKUP_DIRECTORY, `deutschz-${stamp}.sqlite`);
  fs.copyFileSync(db.path, target);
  const files = fs.readdirSync(appConfig.BACKUP_DIRECTORY)
    .filter(name => /^deutschz-.*\.sqlite$/.test(name))
    .map(name => ({ name, time: fs.statSync(path.join(appConfig.BACKUP_DIRECTORY, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
  files.slice(appConfig.BACKUP_RETENTION).forEach(file => fs.unlinkSync(path.join(appConfig.BACKUP_DIRECTORY, file.name)));
  return target;
}
