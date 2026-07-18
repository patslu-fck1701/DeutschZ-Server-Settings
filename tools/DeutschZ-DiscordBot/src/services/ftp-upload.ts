import fs from 'node:fs';
import path from 'node:path';
import posix from 'node:path/posix';
import { Client } from 'basic-ftp';
import { appConfig } from '../config.js';
import type { UploadExecutor, UploadRequestRecord } from './upload-approval.js';

interface UploadedFile {
  finalPath: string;
  backupPath?: string;
}

function localFiles(sourcePath: string): Array<{ localPath: string; relativePath: string; size: number }> {
  const stat = fs.statSync(sourcePath);
  if (stat.isFile()) return [{ localPath: sourcePath, relativePath: path.basename(sourcePath), size: stat.size }];
  const result: Array<{ localPath: string; relativePath: string; size: number }> = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) result.push({ localPath: absolute, relativePath: path.relative(sourcePath, absolute).split(path.sep).join('/'), size: fs.statSync(absolute).size });
    }
  };
  walk(sourcePath);
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function remotePath(request: UploadRequestRecord, relativePath: string): string {
  const sourceIsDirectory = fs.statSync(request.sourcePath).isDirectory();
  const targetIsDirectory = request.targetPath.endsWith('/') || sourceIsDirectory;
  return posix.normalize(targetIsDirectory ? posix.join(request.targetPath, relativePath) : request.targetPath);
}

async function exists(client: Client, remoteFile: string): Promise<boolean> {
  try {
    await client.size(remoteFile);
    return true;
  } catch {
    return false;
  }
}

export class FtpUploadExecutor implements UploadExecutor {
  private readonly completed = new Map<string, UploadedFile[]>();

  async uploadAtomic(request: UploadRequestRecord, options: { createBackup: boolean }): Promise<void> {
    if (!appConfig.FTP_HOST || !appConfig.FTP_USER || !appConfig.FTP_PASSWORD) throw new Error('FTP-Konfiguration ist unvollständig.');
    const client = new Client(30_000);
    client.ftp.verbose = false;
    const uploaded: UploadedFile[] = [];
    try {
      await client.access({ host: appConfig.FTP_HOST, port: appConfig.FTP_PORT, user: appConfig.FTP_USER, password: appConfig.FTP_PASSWORD, secure: false });
      for (const file of localFiles(request.sourcePath)) {
        const finalPath = remotePath(request, file.relativePath);
        const directory = posix.dirname(finalPath);
        const tempPath = `${finalPath}.uploading_${request.requestId}`;
        const backupPath = `${finalPath}.bak_${new Date().toISOString().replace(/[:.]/g, '-')}_${request.requestId}`;
        await client.ensureDir(directory);
        await client.remove(tempPath, true).catch(() => undefined);
        let backup: string | undefined;
        if (await exists(client, finalPath)) {
          if (options.createBackup) {
            await client.rename(finalPath, backupPath);
            backup = backupPath;
          } else {
            await client.remove(finalPath);
          }
        }
        try {
          await client.uploadFrom(file.localPath, tempPath);
          const remoteSize = await client.size(tempPath);
          if (remoteSize !== file.size) throw new Error(`Remote-Größe weicht ab: ${file.relativePath}`);
          await client.rename(tempPath, finalPath);
          uploaded.push({ finalPath, backupPath: backup });
        } catch (error) {
          await client.remove(tempPath, true).catch(() => undefined);
          if (backup && !(await exists(client, finalPath))) await client.rename(backup, finalPath).catch(() => undefined);
          throw error;
        }
      }
      this.completed.set(request.requestId, uploaded);
    } finally {
      client.close();
    }
  }

  async rollback(request: UploadRequestRecord): Promise<void> {
    const uploaded = this.completed.get(request.requestId) ?? [];
    if (!uploaded.length) return;
    if (!appConfig.FTP_HOST || !appConfig.FTP_USER || !appConfig.FTP_PASSWORD) throw new Error('FTP-Konfiguration ist unvollständig.');
    const client = new Client(30_000);
    try {
      await client.access({ host: appConfig.FTP_HOST, port: appConfig.FTP_PORT, user: appConfig.FTP_USER, password: appConfig.FTP_PASSWORD, secure: false });
      for (const file of [...uploaded].reverse()) {
        await client.remove(file.finalPath, true).catch(() => undefined);
        if (file.backupPath) await client.rename(file.backupPath, file.finalPath);
      }
    } finally {
      client.close();
      this.completed.delete(request.requestId);
    }
  }
}
