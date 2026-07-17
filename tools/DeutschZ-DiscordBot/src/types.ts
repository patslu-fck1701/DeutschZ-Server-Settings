export type ServerState = 'online' | 'offline' | 'unknown';

export interface DayZStatus {
  state: ServerState;
  players: number | null;
  maxPlayers: number;
  name: string;
  map: string;
  ping: number | null;
  checkedAt: string;
  lastSuccessAt: string | null;
  nextCheckAt: string;
  source: 'a2s' | 'cache' | 'unavailable';
  error?: string;
}

export interface TicketRecord {
  id: number;
  guildId: string;
  channelId: string;
  ownerId: string;
  type: string;
  status: 'open' | 'closed';
  priority: string;
  claimedBy: string | null;
  createdAt: string;
}
