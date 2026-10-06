import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync, openSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
export type Row = Record<string, any>;
export type Param = string | number | null;
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export class Store {
  db: DatabaseSync;
  constructor(path = process.env.DATABASE_PATH || './data/claso.sqlite') {
    if (path !== ':memory:') {
      mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
      // Create new databases privately before SQLite creates its matching WAL files.
      closeSync(openSync(resolve(path), 'a', 0o600));
    }
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    this.db.exec(
      'CREATE TABLE IF NOT EXISTS migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
    for (const file of readdirSync(resolve('migrations'))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      if (!this.get('SELECT version FROM migrations WHERE version=?', file))
        this.transaction(() => {
          this.db.exec(readFileSync(resolve('migrations', file), 'utf8'));
          this.run('INSERT INTO migrations VALUES (?,?)', file, now());
        });
    }
  }
  all(sql: string, ...params: Param[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }
  get(sql: string, ...params: Param[]): Row | undefined {
    return this.db.prepare(sql).get(...params) as Row | undefined;
  }
  run(sql: string, ...params: Param[]) {
    return this.db.prepare(sql).run(...params);
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.db.exec('COMMIT');
      return value;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  insert(table: string, data: Row) {
    const cols = Object.keys(data);
    this.run(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      ...Object.values(data),
    );
  }
  audit(
    actor: string | null,
    action: string,
    entity: string,
    target: string,
    context: Row = {},
    requestId?: string,
  ) {
    this.insert('audit_events', {
      id: id(),
      actor_id: actor,
      action,
      entity_type: entity,
      entity_id: target,
      context: JSON.stringify(context),
      request_id: requestId || null,
      created_at: now(),
    });
  }
}
