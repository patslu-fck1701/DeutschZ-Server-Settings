declare module 'gamedig' {
  interface QueryResult {
    name: string;
    map: string;
    maxplayers: number;
    ping?: number;
    players: unknown[];
  }
  export const GameDig: {
    query(options: {type:string;host:string;port:number;maxAttempts?:number;socketTimeout?:number}): Promise<QueryResult>;
  };
}
