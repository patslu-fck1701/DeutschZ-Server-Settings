import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database as SqlDatabase, SqlJsStatic } from 'sql.js';
import { appConfig } from './config.js';

const migrations = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS guild_config (guild_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(guild_id,key));
   CREATE TABLE IF NOT EXISTS mods (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, position INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS tickets (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT NOT NULL UNIQUE, owner_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', priority TEXT NOT NULL DEFAULT 'normal', claimed_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS ticket_members (ticket_id INTEGER NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY(ticket_id,user_id));
   CREATE TABLE IF NOT EXISTS moderation_cases (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, moderator_id TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, internal_note TEXT, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, starts_at TEXT NOT NULL, max_participants INTEGER NOT NULL, reward TEXT NOT NULL, owner_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', channel_id TEXT, message_id TEXT);
   CREATE TABLE IF NOT EXISTS event_participants (event_id INTEGER NOT NULL, user_id TEXT NOT NULL, state TEXT NOT NULL, joined_at TEXT NOT NULL, PRIMARY KEY(event_id,user_id));
   CREATE TABLE IF NOT EXISTS suggestions (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, author_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Eingereicht', official_reply TEXT, channel_id TEXT, message_id TEXT, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS suggestion_votes (suggestion_id INTEGER NOT NULL, user_id TEXT NOT NULL, vote INTEGER NOT NULL CHECK(vote IN (-1,1)), PRIMARY KEY(suggestion_id,user_id));
   CREATE TABLE IF NOT EXISTS verifications (guild_id TEXT NOT NULL, user_id TEXT NOT NULL, verified_at TEXT NOT NULL, PRIMARY KEY(guild_id,user_id));
   CREATE TABLE IF NOT EXISTS restart_reminders (restart_key TEXT NOT NULL, minutes_before INTEGER NOT NULL, sent_at TEXT NOT NULL, PRIMARY KEY(restart_key,minutes_before));`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_owner ON tickets(guild_id,owner_id,status);
   CREATE INDEX IF NOT EXISTS idx_events_start ON events(guild_id,starts_at,status);
   CREATE INDEX IF NOT EXISTS idx_cases_user ON moderation_cases(guild_id,user_id);`,
  `CREATE TABLE IF NOT EXISTS notification_log (dedupe_key TEXT PRIMARY KEY, type TEXT NOT NULL, channel_id TEXT, message_id TEXT, sent_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS system_state (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS upload_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE, requester_user_id TEXT NOT NULL,
      approver_user_id TEXT, guild_id TEXT NOT NULL, channel_id TEXT, message_id TEXT, source_path TEXT NOT NULL,
      target_path TEXT NOT NULL, file_name TEXT NOT NULL, file_size INTEGER NOT NULL, sha256 TEXT NOT NULL,
      upload_type TEXT NOT NULL, server_area TEXT NOT NULL, file_count INTEGER NOT NULL, git_commit TEXT,
      git_branch TEXT, status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','EXPIRED','CANCELLED','UPLOADING','SUCCESS','FAILED','ROLLBACK','UNKNOWN')),
      confirmation_code_hash TEXT, confirmation_code_expires_at TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
      approved_at TEXT, started_at TEXT, finished_at TEXT, error_code TEXT, error_message TEXT, rollback_status TEXT);
   CREATE TABLE IF NOT EXISTS upload_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT, actor_user_id TEXT, guild_id TEXT NOT NULL,
      channel_id TEXT, action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_upload_status ON upload_requests(guild_id,status,expires_at);
   CREATE INDEX IF NOT EXISTS idx_upload_audit_request ON upload_audit(request_id,created_at);`,
  `ALTER TABLE mods ADD COLUMN workshop_id TEXT;
   ALTER TABLE mods ADD COLUMN version TEXT;
   ALTER TABLE mods ADD COLUMN build_id TEXT;
   ALTER TABLE mods ADD COLUMN source_path TEXT;
   ALTER TABLE mods ADD COLUMN source_hash TEXT;
   ALTER TABLE mods ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
   ALTER TABLE mods ADD COLUMN updated_at TEXT;
   CREATE TABLE IF NOT EXISTS source_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, source_type TEXT NOT NULL, source_name TEXT NOT NULL, source_path TEXT, source_hash TEXT NOT NULL, game_version TEXT, mod_workshop_id TEXT, mod_build_id TEXT, mod_version TEXT, server_snapshot_id INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT);
   CREATE TABLE IF NOT EXISTS server_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL, source_mode TEXT NOT NULL, source_hash TEXT NOT NULL, game_version TEXT, created_at TEXT NOT NULL, activated_at TEXT, error TEXT);
   CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, class_name TEXT NOT NULL, display_name TEXT, item_type TEXT, source_type TEXT NOT NULL, source_name TEXT NOT NULL, source_path TEXT, source_hash TEXT, enabled INTEGER NOT NULL DEFAULT 1, nominal INTEGER, minimum INTEGER, lifetime INTEGER, restock INTEGER, category TEXT, usage_json TEXT, value_json TEXT, picture TEXT, data_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, UNIQUE(snapshot_id,class_name,source_type,source_name));
   CREATE TABLE IF NOT EXISTS item_aliases (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, alias TEXT NOT NULL, normalized_alias TEXT NOT NULL, language TEXT, UNIQUE(item_id,normalized_alias));
   CREATE TABLE IF NOT EXISTS item_assets (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, asset_type TEXT NOT NULL, source_type TEXT NOT NULL, source_path TEXT NOT NULL, cache_path TEXT, source_hash TEXT, width INTEGER, height INTEGER, mime_type TEXT, priority INTEGER NOT NULL DEFAULT 0, valid INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(item_id,asset_type,source_path));
   CREATE TABLE IF NOT EXISTS item_variants (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, class_name TEXT NOT NULL, data_json TEXT, UNIQUE(item_id,class_name));
   CREATE TABLE IF NOT EXISTS item_attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL, attachment_class TEXT NOT NULL, slot_name TEXT, source_type TEXT NOT NULL, UNIQUE(item_id,attachment_class,slot_name));
   CREATE TABLE IF NOT EXISTS recipes (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, result_class TEXT NOT NULL, result_name TEXT, result_quantity REAL, duration_seconds REAL, tool_wear REAL, source_type TEXT NOT NULL, source_name TEXT NOT NULL, source_path TEXT, source_hash TEXT, server_modified INTEGER NOT NULL DEFAULT 0, data_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS recipe_ingredients (id INTEGER PRIMARY KEY AUTOINCREMENT, recipe_id INTEGER NOT NULL, class_name TEXT NOT NULL, quantity REAL, consumed_quantity REAL, condition_json TEXT, is_tool INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS loot_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, item_class TEXT NOT NULL, category TEXT, usage_json TEXT, value_json TEXT, event_name TEXT, source_path TEXT, data_json TEXT);
   CREATE TABLE IF NOT EXISTS knowledge_documents (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER, title TEXT NOT NULL, source_type TEXT NOT NULL, source_name TEXT NOT NULL, source_path TEXT, source_hash TEXT, approved INTEGER NOT NULL DEFAULT 0, content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS knowledge_chunks (id INTEGER PRIMARY KEY AUTOINCREMENT, document_id INTEGER NOT NULL, chunk_index INTEGER NOT NULL, content TEXT NOT NULL, UNIQUE(document_id,chunk_index));
   CREATE TABLE IF NOT EXISTS market_settings (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, source_path TEXT NOT NULL, currency_json TEXT, global_sell_percent REAL, data_json TEXT);
   CREATE TABLE IF NOT EXISTS market_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, category_id TEXT NOT NULL, display_name TEXT, icon TEXT, color TEXT, is_exchange INTEGER, init_stock_percent REAL, source_path TEXT, UNIQUE(snapshot_id,category_id));
   CREATE TABLE IF NOT EXISTS market_items (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, category_id TEXT, class_name TEXT NOT NULL, min_price REAL, max_price REAL, sell_price_percent REAL, min_stock INTEGER, max_stock INTEGER, quantity_percent REAL, variants_json TEXT, spawn_attachments_json TEXT, source_path TEXT, UNIQUE(snapshot_id,category_id,class_name));
   CREATE TABLE IF NOT EXISTS market_zones (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, zone_id TEXT NOT NULL, display_name TEXT, buy_price_percent REAL, sell_price_percent REAL, source_path TEXT, UNIQUE(snapshot_id,zone_id));
   CREATE TABLE IF NOT EXISTS market_zone_stock (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, zone_id TEXT NOT NULL, class_name TEXT NOT NULL, current_stock INTEGER, min_stock INTEGER, max_stock INTEGER, current_buy_price REAL, current_sell_price REAL, currency TEXT, live INTEGER NOT NULL DEFAULT 0, observed_at TEXT NOT NULL, UNIQUE(snapshot_id,zone_id,class_name));
   CREATE TABLE IF NOT EXISTS traders (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, trader_id TEXT NOT NULL, display_name TEXT, zone_id TEXT, source_path TEXT, data_json TEXT, UNIQUE(snapshot_id,trader_id));
   CREATE TABLE IF NOT EXISTS trader_catalog (id INTEGER PRIMARY KEY AUTOINCREMENT, trader_id INTEGER NOT NULL, category_id TEXT, class_name TEXT, can_buy INTEGER NOT NULL DEFAULT 1, can_sell INTEGER NOT NULL DEFAULT 1, UNIQUE(trader_id,category_id,class_name));
   CREATE TABLE IF NOT EXISTS currencies (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER NOT NULL, class_name TEXT NOT NULL, display_name TEXT, value REAL, source_path TEXT, UNIQUE(snapshot_id,class_name));
   CREATE TABLE IF NOT EXISTS sync_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, run_key TEXT NOT NULL UNIQUE, source_mode TEXT NOT NULL, status TEXT NOT NULL, files_scanned INTEGER NOT NULL DEFAULT 0, records_imported INTEGER NOT NULL DEFAULT 0, warnings INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, finished_at TEXT, message TEXT);
   CREATE TABLE IF NOT EXISTS admin_ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, author_id TEXT NOT NULL, title TEXT NOT NULL, idea_type TEXT NOT NULL, description TEXT NOT NULL, problem TEXT, benefits TEXT, disadvantages TEXT, risks TEXT, dependencies TEXT, workshop_url TEXT, github_url TEXT, other_url TEXT, priority TEXT, test_proposal TEXT, status TEXT NOT NULL DEFAULT 'Neu', channel_id TEXT, thread_id TEXT, message_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS idea_votes (idea_id INTEGER NOT NULL, user_id TEXT NOT NULL, vote TEXT NOT NULL CHECK(vote IN ('up','down','test')), updated_at TEXT NOT NULL, PRIMARY KEY(idea_id,user_id));
   CREATE TABLE IF NOT EXISTS idea_attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, idea_id INTEGER NOT NULL, discord_url TEXT NOT NULL, file_name TEXT NOT NULL, content_type TEXT, size INTEGER, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS answer_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, command_name TEXT NOT NULL, query_text TEXT NOT NULL, source_types TEXT NOT NULL, snapshot_id INTEGER, reliable INTEGER NOT NULL, created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_items_class ON items(class_name,enabled,snapshot_id);
   CREATE INDEX IF NOT EXISTS idx_alias_normalized ON item_aliases(normalized_alias);
   CREATE INDEX IF NOT EXISTS idx_market_class ON market_items(class_name,snapshot_id);
   CREATE INDEX IF NOT EXISTS idx_recipes_result ON recipes(result_class,snapshot_id);
   CREATE INDEX IF NOT EXISTS idx_ideas_guild ON admin_ideas(guild_id,status,updated_at);`,
  `CREATE TABLE IF NOT EXISTS security_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, channel_id TEXT,
      actor_user_id TEXT NOT NULL, command_name TEXT NOT NULL, result TEXT NOT NULL,
      detail TEXT, created_at TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS idx_security_audit_actor ON security_audit(guild_id,actor_user_id,created_at);`,
  `CREATE TABLE IF NOT EXISTS website_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT, external_request_id TEXT NOT NULL UNIQUE, form_name TEXT NOT NULL,
      name TEXT NOT NULL, discord_name TEXT, email TEXT, request_type TEXT, budget TEXT, message TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('NEW','NOTIFIED','ACCEPTED','REJECTED','IN_PROGRESS','DONE','FAILED')) DEFAULT 'NEW',
      source_created_at TEXT NOT NULL, received_at TEXT NOT NULL, whatsapp_message_id TEXT,
      notification_status TEXT NOT NULL DEFAULT 'PENDING', retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, handled_at TEXT, handled_by TEXT, payload_hash TEXT NOT NULL UNIQUE);
   CREATE TABLE IF NOT EXISTS website_lead_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'PENDING',
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL, locked_at TEXT, last_error TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS website_lead_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id INTEGER, external_request_id TEXT, actor_type TEXT NOT NULL,
      actor_id TEXT, action TEXT NOT NULL, old_status TEXT, new_status TEXT, detail TEXT, created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS webhook_replays (
      provider TEXT NOT NULL, replay_key TEXT NOT NULL, payload_hash TEXT NOT NULL, received_at TEXT NOT NULL,
      PRIMARY KEY(provider,replay_key));
   CREATE TABLE IF NOT EXISTS whatsapp_inbound_messages (
      message_id TEXT PRIMARY KEY, sender_hash TEXT NOT NULL, command_text TEXT NOT NULL, received_at TEXT NOT NULL,
      processed_at TEXT, result TEXT);
   CREATE INDEX IF NOT EXISTS idx_leads_status ON website_leads(status,received_at);
   CREATE INDEX IF NOT EXISTS idx_lead_queue_due ON website_lead_queue(status,next_attempt_at);
   CREATE INDEX IF NOT EXISTS idx_lead_audit_request ON website_lead_audit(external_request_id,created_at);`
  ,`CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, team_key TEXT NOT NULL,
      display_name TEXT NOT NULL, description TEXT, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(guild_id,team_key));
    CREATE TABLE IF NOT EXISTS team_members (
      team_id INTEGER NOT NULL, user_id TEXT NOT NULL, team_role TEXT NOT NULL,
      permissions_json TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(team_id,user_id));
    CREATE TABLE IF NOT EXISTS discord_resource_registry (
      guild_id TEXT NOT NULL, resource_type TEXT NOT NULL, resource_key TEXT NOT NULL,
      discord_id TEXT NOT NULL, metadata_json TEXT, updated_at TEXT NOT NULL,
      PRIMARY KEY(guild_id,resource_type,resource_key));
    CREATE TABLE IF NOT EXISTS market_import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, source_root TEXT NOT NULL, source_hash TEXT NOT NULL,
      status TEXT NOT NULL, category_count INTEGER NOT NULL DEFAULT 0, item_count INTEGER NOT NULL DEFAULT 0,
      trader_count INTEGER NOT NULL DEFAULT 0, warning_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0, started_at TEXT NOT NULL, finished_at TEXT, message TEXT);
    CREATE TABLE IF NOT EXISTS market_catalog_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, category_key TEXT NOT NULL,
      display_name TEXT NOT NULL, icon TEXT, color TEXT, source_path TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0, UNIQUE(run_id,category_key));
    CREATE TABLE IF NOT EXISTS market_catalog_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, category_key TEXT NOT NULL,
      class_name TEXT NOT NULL, min_price REAL, max_price REAL, sell_price_percent REAL,
      min_stock INTEGER, max_stock INTEGER, quantity_percent REAL, variants_json TEXT,
      attachments_json TEXT, source_path TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0,
      UNIQUE(run_id,category_key,class_name));
    CREATE TABLE IF NOT EXISTS market_catalog_traders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id INTEGER NOT NULL, trader_key TEXT NOT NULL,
      display_name TEXT NOT NULL, currencies_json TEXT NOT NULL, source_path TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 0, UNIQUE(run_id,trader_key));
    CREATE TABLE IF NOT EXISTS market_trader_categories (
      trader_id INTEGER NOT NULL, category_key TEXT NOT NULL, display_order INTEGER NOT NULL,
      PRIMARY KEY(trader_id,category_key));
    CREATE INDEX IF NOT EXISTS idx_market_catalog_item_class ON market_catalog_items(active,class_name);
    CREATE INDEX IF NOT EXISTS idx_market_catalog_category ON market_catalog_items(active,category_key);
    CREATE INDEX IF NOT EXISTS idx_market_trader_category ON market_trader_categories(category_key);
    CREATE INDEX IF NOT EXISTS idx_team_member_user ON team_members(user_id,active);`
];

const defaultMods = [
  '@CF', '@Dabs Framework', '@Community-Online-Tools', '@VPPAdminTools',
  '@DayZ-Expansion-Bundle', '@DayZ-Expansion-Licensed', '@BaseBuildingPlus',
  '@Code Lock', '@RaG_Core', '@RaG_BaseItems', '@RedFalcon Flight System Heliz',
  '@BS Patrol Tank', '@NoxZ_Phone', '@NVG + Scope', '@RevScopes', '@MegaFoodPack',
  '@Modular Vest System-Bastions Editon', '@ReDos Bags', '@ArmA2 Trucks',
  '@SNAFU Weapons', '@SprayZ', '@COT Bundle Utility', '@DeutschZ_only_core'
];

export class Database {
  private transactionDepth = 0;
  private constructor(private readonly sql: SqlJsStatic, private readonly db: SqlDatabase, private readonly file: string) {}

  static async open(file = appConfig.DATABASE_URL): Promise<Database> {
    const normalized = file.replace(/^sqlite:/i, '').replace(/^file:/i, '');
    const resolved = path.resolve(normalized);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const sql = await initSqlJs();
    const db = fs.existsSync(resolved) ? new sql.Database(fs.readFileSync(resolved)) : new sql.Database();
    const instance = new Database(sql, db, resolved);
    instance.migrate();
    instance.seedMods();
    instance.save();
    return instance;
  }

  private migrate(): void {
    this.db.run(migrations[0]!);
    for (let version = 1; version < migrations.length; version += 1) {
      const found = this.scalar<number>('SELECT version FROM schema_migrations WHERE version=?', [version]);
      if (found === undefined) {
        this.transaction(() => {
          this.db.run(migrations[version]!);
          this.db.run('INSERT INTO schema_migrations(version,applied_at) VALUES(?,?)', [version, new Date().toISOString()]);
        });
      }
    }
  }

  private seedMods(): void {
    const count = this.scalar<number>('SELECT COUNT(*) FROM mods') ?? 0;
    if (count === 0) {
      this.transaction(() => defaultMods.forEach((name, position) => this.db.run('INSERT INTO mods(name,position) VALUES(?,?)', [name, position])));
    }
  }

  transaction(work: () => void): void {
    const outermost = this.transactionDepth === 0;
    if (outermost) this.db.run('BEGIN IMMEDIATE');
    this.transactionDepth += 1;
    try {
      work();
      this.transactionDepth -= 1;
      if (outermost) {
        this.db.run('COMMIT');
        this.save();
      }
    } catch (error) {
      this.transactionDepth -= 1;
      if (outermost) this.db.run('ROLLBACK');
      throw error;
    }
  }

  run(sql: string, params: unknown[] = []): void {
    this.db.run(sql, params as any[]);
    if (this.transactionDepth === 0) this.save();
  }

  rows<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    const statement = this.db.prepare(sql, params as any[]);
    const rows: T[] = [];
    while (statement.step()) rows.push(statement.getAsObject() as T);
    statement.free();
    return rows;
  }

  scalar<T>(sql: string, params: unknown[] = []): T | undefined {
    const row = this.rows<Record<string, T>>(sql, params)[0];
    return row ? Object.values(row)[0] : undefined;
  }

  getConfig(guildId: string, key: string): string | undefined {
    return this.scalar<string>('SELECT value FROM guild_config WHERE guild_id=? AND key=?', [guildId, key]);
  }

  setConfig(guildId: string, key: string, value: string): void {
    this.run('INSERT INTO guild_config(guild_id,key,value) VALUES(?,?,?) ON CONFLICT(guild_id,key) DO UPDATE SET value=excluded.value', [guildId, key, value]);
  }

  listMods(): string[] {
    return this.rows<{name: string}>('SELECT name FROM mods ORDER BY position,id').map(row => row.name);
  }

  addMod(name: string): void {
    const next = (this.scalar<number>('SELECT COALESCE(MAX(position),-1)+1 FROM mods') ?? 0);
    this.run('INSERT INTO mods(name,position) VALUES(?,?)', [name, next]);
  }

  removeMod(name: string): boolean {
    const before = this.scalar<number>('SELECT COUNT(*) FROM mods') ?? 0;
    this.run('DELETE FROM mods WHERE name=?', [name]);
    return (this.scalar<number>('SELECT COUNT(*) FROM mods') ?? 0) < before;
  }

  save(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.file);
  }

  close(): void {
    this.save();
    this.db.close();
  }

  get path(): string { return this.file; }
}
