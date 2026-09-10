/** The encrypted vault. ChaCha20-Poly1305 through SQLite3 Multiple Ciphers, one key per
 *  page, so the file on disk is never plaintext -- including while the app is running. */

import DatabaseConstructor from 'better-sqlite3-multiple-ciphers';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MIGRATIONS } from './schema.js';

export class VaultLocked extends Error {
  constructor() {
    super('The vault is locked.');
    this.name = 'VaultLocked';
  }
}

export class VaultDamaged extends Error {
  constructor(detail: string, options?: ErrorOptions) {
    super(detail, options);
    this.name = 'VaultDamaged';
  }
}

interface Header {
  version: 1;
  salt: string;
  createdAt: string;
  /** Which encrypted-file format the database library wrote. It changed once, and a
   *  vault written before that cannot be opened by the library shipping now. */
  format?: number;
}

/** The format this build writes. A header without one predates the change. */
const FORMAT = 2;

type Db = InstanceType<typeof DatabaseConstructor>;

/** The database is a native binding, compiled for one runtime's ABI. Electron and the
 *  system Node have different ones, so a module built by `npm install` cannot be
 *  loaded by Electron until it is rebuilt against it.
 */
function openDatabase(path: string): Db {
  try {
    return new DatabaseConstructor(path);
  } catch (cause) {
    const message = String(cause instanceof Error ? cause.message : cause);
    if (message.includes('NODE_MODULE_VERSION')) {
      throw new Error(
        'The database module was built for a different runtime than the one Cairn is ' +
          'running on, so the vault cannot be opened. Run `npm run rebuild` and start ' +
          'Cairn again.',
        { cause },
      );
    }
    throw cause;
  }
}

export class Store {
  private db: Db | null = null;

  constructor(private readonly vaultPath: string) {}

  get headerPath(): string {
    return join(dirname(this.vaultPath), 'vault.header.json');
  }

  /** True once a vault has been created. False is the entire first-run condition:
   *  no vault, no profile, no settings, nothing to show and nothing to guess. */
  exists(): boolean {
    return existsSync(this.vaultPath) && existsSync(this.headerPath);
  }

  /** The format the vault on disk was written in, and the newest this build reads.
   *  Readable without the key, so the lock screen can warn before anybody types. */
  formats(): { onDisk: number | null; readable: number } {
    if (!this.exists()) return { onDisk: null, readable: FORMAT };
    try {
      return { onDisk: this.readHeader().format ?? 1, readable: FORMAT };
    } catch {
      return { onDisk: null, readable: FORMAT };
    }
  }

  readHeader(): Header {
    try {
      const header = JSON.parse(readFileSync(this.headerPath, 'utf8')) as Header;
      if (header.version !== 1 || typeof header.salt !== 'string') {
        throw new Error('unrecognised header');
      }
      return header;
    } catch (cause) {
      throw new VaultDamaged(
        `The vault header at vault.header.json cannot be read, so the key cannot be derived. ${String(cause)}`,
      );
    }
  }

  writeHeader(salt: string): void {
    mkdirSync(dirname(this.headerPath), { recursive: true });
    const header: Header = { version: 1, salt, createdAt: new Date().toISOString(), format: FORMAT };
    writeFileSync(this.headerPath, JSON.stringify(header, null, 2), { mode: 0o600 });
  }

  /** Open with the derived key. A vault that will not open raises -- it is never
   *  quietly treated as empty, because an empty vault reads exactly like somebody
   *  who has entered nothing. */
  open(keyHex: string): void {
    mkdirSync(dirname(this.vaultPath), { recursive: true });
    const db = openDatabase(this.vaultPath);
    db.pragma(`cipher='chacha20'`);
    db.pragma(`key="x'${keyHex}'"`);
    try {
      db.prepare('SELECT count(*) FROM sqlite_master').get();
    } catch (cause) {
      db.close();
      // A wrong passphrase and an older file look identical from here, and blaming the
      // passphrase for a library change sends somebody to reset something that is right.
      if ((this.readHeader().format ?? 1) < FORMAT) {
        throw new VaultDamaged(
          'This vault was written by an older Cairn, whose encrypted file format this ' +
            'version cannot read. Nothing has been changed. Your records are still there ' +
            'and the version that wrote them can still open them — docs/upgrading.md has ' +
            'the steps.',
          { cause },
        );
      }
      throw new VaultDamaged('That passphrase did not open the vault. Nothing has been changed.', { cause });
    }
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('secure_delete = ON');
    this.db = db;
    this.migrate();
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  get isOpen(): boolean {
    return this.db !== null;
  }

  /** The vault on disk, write-ahead log included. In WAL mode the main file barely
   *  grows until a checkpoint, so reading it alone showed 4 kB beside a vault holding
   *  hundreds of postings. */
  sizeBytes(): number {
    let total = 0;
    for (const part of [this.vaultPath, `${this.vaultPath}-wal`, `${this.vaultPath}-shm`]) {
      try { total += statSync(part).size; } catch { /* not there yet, and that is fine */ }
    }
    return total;
  }

  private handle(): Db {
    if (!this.db) throw new VaultLocked();
    return this.db;
  }

  private migrate(): void {
    const db = this.handle();
    db.exec('CREATE TABLE IF NOT EXISTS migration (id INTEGER PRIMARY KEY, name TEXT NOT NULL, at TEXT NOT NULL)');
    const done = new Set(
      (db.prepare('SELECT id FROM migration').all() as { id: number }[]).map((r) => r.id),
    );
    const record = db.prepare('INSERT INTO migration (id, name, at) VALUES (?, ?, ?)');
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      db.transaction(() => {
        db.exec(m.up);
        record.run(m.id, m.name, new Date().toISOString());
      })();
    }
  }

  all<T>(sql: string, params: unknown[] = []): T[] {
    return this.handle().prepare(sql).all(...params) as T[];
  }

  get<T>(sql: string, params: unknown[] = []): T | undefined {
    return this.handle().prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, params: unknown[] = []): void {
    this.handle().prepare(sql).run(...params);
  }

  transaction<T>(fn: () => T): T {
    return this.handle().transaction(fn)();
  }

  /** Every table in the vault, with how many rows each holds. */
  tables(): { name: string; rows: number }[] {
    return this.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .map(({ name }) => ({
        name,
        // The name comes from sqlite_master rather than from anything typed, so it is
        // the database's own word for it and cannot carry anything else.
        rows: this.get<{ n: number }>(`SELECT count(*) AS n FROM "${name}"`)?.n ?? 0,
      }));
  }

  /** How a row in this table is addressed, in the database's own words. Composite for
   *  a board, which is a source and a token; a single column everywhere else. A table
   *  with none cannot be edited, because there would be no way to say which row. */
  primaryKey(table: string): string[] {
    return this.all<{ name: string; pk: number }>(`PRAGMA table_info("${table}")`)
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
  }

  /** The declared type of each column, so a number stays a number. */
  columnTypes(table: string): Map<string, string> {
    return new Map(this.all<{ name: string; type: string }>(`PRAGMA table_info("${table}")`)
      .map((column) => [column.name, column.type.toUpperCase()]));
  }

  /** Read something, with the database itself refusing to write while it runs.
   *  `query_only` is the guard that holds, and it is put back in a `finally`. */
  read(sql: string, params: unknown[] = []): { columns: string[]; rows: unknown[][] } {
    const db = this.handle();
    db.pragma('query_only = true');
    try {
      const statement = db.prepare(sql);
      if (!statement.reader) {
        throw new Error('That statement does not return anything, so it is not a query.');
      }
      const rows = statement.raw().all(...params) as unknown[][];
      return { columns: statement.columns().map((c) => c.name), rows };
    } finally {
      db.pragma('query_only = false');
    }
  }
}
