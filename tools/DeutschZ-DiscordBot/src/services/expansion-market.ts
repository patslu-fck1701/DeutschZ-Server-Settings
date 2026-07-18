import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from '../config.js';
import type { Database } from '../database.js';

type JsonRecord = Record<string, unknown>;

export interface MarketSyncResult {
  changed: boolean;
  runId: number;
  sourceRoot: string;
  categories: number;
  items: number;
  traders: number;
  warnings: string[];
  errors: string[];
}

export interface MarketItemResult {
  className: string;
  categoryKey: string;
  categoryName: string;
  minPrice: number | null;
  maxPrice: number | null;
  sellPricePercent: number | null;
  minStock: number | null;
  maxStock: number | null;
  traders: string[];
}

const readJson = (file: string): JsonRecord => JSON.parse(fs.readFileSync(file, 'utf8')) as JsonRecord;
const asNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
const asString = (value: unknown): string => typeof value === 'string' ? value : '';
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const friendlyName = (value: string, fallback: string): string => value && !value.startsWith('#STR_') ? value : fallback.replaceAll('_', ' ');

function hashFiles(files: string[]): string {
  const digest = crypto.createHash('sha256');
  for (const file of files.sort((a, b) => a.localeCompare(b))) {
    digest.update(path.basename(file).toLowerCase());
    digest.update(fs.readFileSync(file));
  }
  return digest.digest('hex');
}

export class ExpansionMarketService {
  constructor(private readonly db: Database) {}

  discoverSourceRoot(): string {
    for (const candidate of appConfig.dayzMarketSourceRoots) {
      if (fs.existsSync(path.join(candidate, 'Market')) && fs.existsSync(path.join(candidate, 'Traders'))) return path.resolve(candidate);
    }
    throw new Error(`Keine lesbare Expansion-Market-Quelle gefunden. Geprüft: ${appConfig.dayzMarketSourceRoots.length}`);
  }

  sync(force = false): MarketSyncResult {
    const sourceRoot = this.discoverSourceRoot();
    const marketDir = path.join(sourceRoot, 'Market');
    const traderDir = path.join(sourceRoot, 'Traders');
    const categoryFiles = fs.readdirSync(marketDir).filter(file => file.toLowerCase().endsWith('.json')).map(file => path.join(marketDir, file));
    const traderFiles = fs.readdirSync(traderDir).filter(file => file.toLowerCase().endsWith('.json')).map(file => path.join(traderDir, file));
    const sourceHash = hashFiles([...categoryFiles, ...traderFiles]);
    const last = this.db.rows<{id:number;source_hash:string;source_root:string;category_count:number;item_count:number;trader_count:number}>(
      "SELECT id,source_hash,source_root,category_count,item_count,trader_count FROM market_import_runs WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1"
    )[0];
    if (!force && last?.source_hash === sourceHash && path.resolve(last.source_root) === sourceRoot) {
      return { changed: false, runId: last.id, sourceRoot, categories: last.category_count, items: last.item_count, traders: last.trader_count, warnings: [], errors: [] };
    }

    const startedAt = new Date().toISOString();
    this.db.run("INSERT INTO market_import_runs(source_root,source_hash,status,started_at) VALUES(?,?,'RUNNING',?)", [sourceRoot, sourceHash, startedAt]);
    // Database.run() persists the sql.js database immediately outside a
    // transaction. Exporting can reset last_insert_rowid(), so resolve the
    // freshly persisted import row explicitly instead of reusing an older ID.
    const runId = this.db.scalar<number>('SELECT MAX(id) FROM market_import_runs')!;
    const warnings: string[] = [];
    const errors: string[] = [];
    let categories = 0;
    let items = 0;
    let traders = 0;

    try {
      this.db.transaction(() => {
        for (const file of categoryFiles) {
          try {
            const data = readJson(file);
            const records = asArray(data.Items);
            if (!Array.isArray(data.Items)) { warnings.push(`${path.basename(file)}: kein Items-Array`); continue; }
            const categoryKey = path.basename(file, '.json');
            const displayName = friendlyName(asString(data.DisplayName), categoryKey);
            this.db.run('INSERT INTO market_catalog_categories(run_id,category_key,display_name,icon,color,source_path) VALUES(?,?,?,?,?,?)', [
              runId, categoryKey, displayName, asString(data.Icon) || null, asString(data.Color) || null, file
            ]);
            categories += 1;
            for (const record of records) {
              if (!record || typeof record !== 'object') { warnings.push(`${path.basename(file)}: ungültiger Item-Eintrag`); continue; }
              const item = record as JsonRecord;
              const className = asString(item.ClassName).trim();
              if (!className) { warnings.push(`${path.basename(file)}: Item ohne ClassName`); continue; }
              this.db.run('INSERT INTO market_catalog_items(run_id,category_key,class_name,min_price,max_price,sell_price_percent,min_stock,max_stock,quantity_percent,variants_json,attachments_json,source_path) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [
                runId, categoryKey, className, asNumber(item.MinPriceThreshold), asNumber(item.MaxPriceThreshold), asNumber(item.SellPricePercent),
                asNumber(item.MinStockThreshold), asNumber(item.MaxStockThreshold), asNumber(item.QuantityPercent),
                JSON.stringify(asArray(item.Variants)), JSON.stringify(asArray(item.SpawnAttachments)), file
              ]);
              items += 1;
            }
          } catch (error) {
            errors.push(`${path.basename(file)}: ${error instanceof Error ? error.message : 'Lesefehler'}`);
          }
        }

        for (const file of traderFiles) {
          try {
            const data = readJson(file);
            const traderKey = path.basename(file, '.json');
            const displayName = friendlyName(asString(data.DisplayName), traderKey);
            this.db.run('INSERT INTO market_catalog_traders(run_id,trader_key,display_name,currencies_json,source_path) VALUES(?,?,?,?,?)', [
              runId, traderKey, displayName, JSON.stringify(asArray(data.Currencies)), file
            ]);
            const traderId = this.db.scalar<number>('SELECT last_insert_rowid()')!;
            asArray(data.Categories).forEach((rawCategory, index) => {
              const categoryKey = asString(rawCategory).split(':')[0]!.trim();
              if (categoryKey) this.db.run('INSERT OR IGNORE INTO market_trader_categories(trader_id,category_key,display_order) VALUES(?,?,?)', [traderId, categoryKey, index]);
            });
            traders += 1;
          } catch (error) {
            errors.push(`${path.basename(file)}: ${error instanceof Error ? error.message : 'Lesefehler'}`);
          }
        }

        if (errors.length) {
          const sample = errors.slice(0, 3).join(' | ');
          throw new Error(`${errors.length} Market-Dateien konnten nicht importiert werden. Beispiele: ${sample}`);
        }
        this.db.run('UPDATE market_catalog_categories SET active=0 WHERE active=1');
        this.db.run('UPDATE market_catalog_items SET active=0 WHERE active=1');
        this.db.run('UPDATE market_catalog_traders SET active=0 WHERE active=1');
        this.db.run('UPDATE market_catalog_categories SET active=1 WHERE run_id=?', [runId]);
        this.db.run('UPDATE market_catalog_items SET active=1 WHERE run_id=?', [runId]);
        this.db.run('UPDATE market_catalog_traders SET active=1 WHERE run_id=?', [runId]);
        this.db.run("UPDATE market_import_runs SET status='SUCCESS',category_count=?,item_count=?,trader_count=?,warning_count=?,error_count=0,finished_at=?,message=? WHERE id=?", [
          categories, items, traders, warnings.length, new Date().toISOString(), warnings.slice(0, 10).join(' | ') || null, runId
        ]);
      });
    } catch (error) {
      this.db.run("UPDATE market_import_runs SET status='FAILED',category_count=?,item_count=?,trader_count=?,warning_count=?,error_count=?,finished_at=?,message=? WHERE id=?", [
        categories, items, traders, warnings.length, Math.max(1, errors.length), new Date().toISOString(), error instanceof Error ? error.message : 'Importfehler', runId
      ]);
      throw error;
    }
    return { changed: true, runId, sourceRoot, categories, items, traders, warnings, errors };
  }

  status(): Record<string, unknown> | undefined {
    return this.db.rows<Record<string, unknown>>('SELECT * FROM market_import_runs ORDER BY id DESC LIMIT 1')[0];
  }

  categories(limit = 50): Array<{categoryKey:string;displayName:string;itemCount:number}> {
    return this.db.rows<{categoryKey:string;displayName:string;itemCount:number}>(
      `SELECT c.category_key AS categoryKey,c.display_name AS displayName,COUNT(i.id) AS itemCount
       FROM market_catalog_categories c LEFT JOIN market_catalog_items i ON i.run_id=c.run_id AND i.category_key=c.category_key AND i.active=1
       WHERE c.active=1 GROUP BY c.id ORDER BY c.display_name LIMIT ?`, [limit]
    );
  }

  search(query: string, limit = 20): MarketItemResult[] {
    const term = `%${query.trim().toLowerCase()}%`;
    const rows = this.db.rows<{className:string;categoryKey:string;categoryName:string;minPrice:number|null;maxPrice:number|null;sellPricePercent:number|null;minStock:number|null;maxStock:number|null}>(
      `SELECT i.class_name AS className,i.category_key AS categoryKey,c.display_name AS categoryName,
       i.min_price AS minPrice,i.max_price AS maxPrice,i.sell_price_percent AS sellPricePercent,
       i.min_stock AS minStock,i.max_stock AS maxStock
       FROM market_catalog_items i JOIN market_catalog_categories c ON c.run_id=i.run_id AND c.category_key=i.category_key
       WHERE i.active=1 AND (LOWER(i.class_name) LIKE ? OR LOWER(c.display_name) LIKE ? OR LOWER(i.category_key) LIKE ?)
       ORDER BY CASE WHEN LOWER(i.class_name)=? THEN 0 WHEN LOWER(i.class_name) LIKE ? THEN 1 ELSE 2 END,i.class_name LIMIT ?`,
      [term, term, term, query.trim().toLowerCase(), `${query.trim().toLowerCase()}%`, limit]
    );
    return rows.map(row => ({ ...row, traders: this.tradersForCategory(row.categoryKey) }));
  }

  item(className: string): MarketItemResult | undefined {
    return this.search(className, 25).find(item => item.className.toLowerCase() === className.toLowerCase());
  }

  category(query: string, limit = 25): MarketItemResult[] {
    const term = `%${query.trim().toLowerCase()}%`;
    const rows = this.db.rows<{className:string;categoryKey:string;categoryName:string;minPrice:number|null;maxPrice:number|null;sellPricePercent:number|null;minStock:number|null;maxStock:number|null}>(
      `SELECT i.class_name AS className,i.category_key AS categoryKey,c.display_name AS categoryName,
       i.min_price AS minPrice,i.max_price AS maxPrice,i.sell_price_percent AS sellPricePercent,
       i.min_stock AS minStock,i.max_stock AS maxStock
       FROM market_catalog_items i JOIN market_catalog_categories c ON c.run_id=i.run_id AND c.category_key=i.category_key
       WHERE i.active=1 AND (LOWER(i.category_key) LIKE ? OR LOWER(c.display_name) LIKE ?)
       ORDER BY i.class_name LIMIT ?`, [term, term, limit]
    );
    return rows.map(row => ({ ...row, traders: this.tradersForCategory(row.categoryKey) }));
  }

  private tradersForCategory(categoryKey: string): string[] {
    return this.db.rows<{displayName:string}>(
      `SELECT DISTINCT t.display_name AS displayName FROM market_catalog_traders t
       JOIN market_trader_categories tc ON tc.trader_id=t.id WHERE t.active=1 AND LOWER(tc.category_key)=LOWER(?) ORDER BY t.display_name`,
      [categoryKey]
    ).map(row => row.displayName);
  }
}
