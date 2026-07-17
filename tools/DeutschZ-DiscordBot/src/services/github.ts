import { appConfig } from '../config.js';

export interface RepositoryStatus { repository: string; branch: string; commit: string; message: string; }

export async function latestRepository(url: string): Promise<RepositoryStatus> {
  const match = url.match(/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (!match) throw new Error('Ungültige GitHub-Repository-URL.');
  const response = await fetch(`https://api.github.com/repos/${match[1]}/${match[2]}/commits?per_page=1`, { headers: { 'User-Agent': 'DeutschZ-DiscordBot' }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`GitHub antwortete mit ${response.status}.`);
  const commits = await response.json() as Array<{sha:string;commit:{message:string};html_url:string}>;
  const first = commits[0];
  if (!first) throw new Error('Kein Commit gefunden.');
  return { repository: url, branch: 'default', commit: first.sha.slice(0, 8), message: first.commit.message.split('\n')[0]! };
}

export const repositoryUrls = [appConfig.SERVER_SETTINGS_REPOSITORY, appConfig.MODZ_REPOSITORY];
