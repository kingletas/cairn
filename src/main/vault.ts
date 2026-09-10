/** The vault's life: create, unlock, lock, and lock itself when left alone.
 *  It fails closed: a vault that will not open raises rather than starting empty. */

import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Store } from './db/store.js';
import { defaultVaultDir, rememberVaultAt, vaultDir, vaultFile } from './paths.js';
import { generateMachineName } from './machine.js';
import { MIGRATIONS } from './db/schema.js';
import { archiveFolderName, isSetAsideVault } from './archive.js';
import { dumpDir, logDir } from './diagnostics.js';

const require = createRequire(import.meta.url);

interface Keyring {
  newSalt(): string;
  unlock(passphrase: string, saltHex: string): string;
  lock(): void;
  isUnlocked(): boolean;
  kdfParams(): { algorithm: string; memoryKib: number; passes: number; lanes: number };
}

/** The native module is required, not optional. Without it there is no way to promise
 *  a key is wiped on lock, and locking that does not wipe is theatre.
 */
function loadKeyring(): Keyring {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '../../native');
  try {
    const built = readdirSync(dir).find((name) => name.endsWith('.node'));
    if (!built) throw new Error(`no .node file in ${dir}`);
    return require(join(dir, built)) as Keyring;
  } catch (cause) {
    throw new Error(
      'The Cairn key module is not built, so the vault cannot be opened. Run `make build` and try again. ' +
        `(${String(cause)})`,
      { cause },
    );
  }
}

export class Vault {
  /** Built for wherever the vault is now. Held by value it kept pointing at the folder
   *  a move had just emptied, and every read after that failed on a path that was
   *  correct when the app started. */
  private opened: { path: string; store: Store } | null = null;

  get store(): Store {
    const path = vaultFile();
    if (this.opened === null || this.opened.path !== path) {
      this.opened = { path, store: new Store(path) };
    }
    return this.opened.store;
  }

  private keyring: Keyring | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private lockAfterMs: number | null = null;
  private locked: (() => void) | null = null;

  /** Told when the vault locks, however it happened -- the button, the idle timer,
   *  suspend or the screen locking. A window still showing records after the key is
   *  wiped is the one thing this app must not do. */
  onLock(told: () => void): void {
    this.locked = told;
  }

  private key(): Keyring {
    this.keyring ??= loadKeyring();
    return this.keyring;
  }

  /** True on a machine that has never run Cairn, and the whole first-run condition.
   *  Nothing is guessed, nothing is seeded, and no window opens onto a pipeline that
   *  does not exist -- setup runs instead. */
  get isFirstRun(): boolean {
    return !this.store.exists();
  }

  get isUnlocked(): boolean {
    return this.store.isOpen && this.key().isUnlocked();
  }

  kdf(): { algorithm: string; memoryKib: number; passes: number; lanes: number } {
    return this.key().kdfParams();
  }

  /** Create a vault. Refuses to touch an existing one -- overwriting somebody's
   *  records because a code path assumed a fresh install is not recoverable. */
  create(passphrase: string): void {
    if (this.store.exists()) {
      throw new Error('A vault already exists here. Cairn will not overwrite it.');
    }
    if (passphrase.length < 10) {
      throw new Error('Use at least ten characters. This is the only thing between your records and a copied disk.');
    }
    mkdirSync(vaultDir(), { recursive: true });
    const salt = this.key().newSalt();
    this.store.writeHeader(salt);
    const keyHex = this.key().unlock(passphrase, salt);
    this.store.open(keyHex);
    this.store.run('INSERT INTO profile (id) VALUES (1)');
    this.store.run("INSERT INTO settings (key, value) VALUES ('machineName', ?)", [
      JSON.stringify(generateMachineName()),
    ]);
  }

  unlock(passphrase: string): void {
    if (!this.store.exists()) throw new Error('There is no vault here yet.');
    const { salt } = this.store.readHeader();
    const keyHex = this.key().unlock(passphrase, salt);
    this.store.open(keyHex);
    this.resetIdle();
  }

  lock(): void {
    this.store.close();
    this.key().lock();
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.locked?.();
  }

  /** Lock after this many idle minutes. Null means only on request. */
  setIdleLock(minutes: number | null): void {
    this.lockAfterMs = minutes === null ? null : minutes * 60_000;
    this.resetIdle();
  }

  resetIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    if (this.lockAfterMs === null || !this.store.isOpen) return;
    this.idleTimer = setTimeout(() => this.lock(), this.lockAfterMs);
  }

  /** Move everything aside and leave a first run behind. One rename of the whole folder,
   *  so the database and the salt its key comes from move together. Nothing is deleted. */
  startOver(now = new Date()): string | null {
    this.lock();
    const dir = vaultDir();
    // Nothing to move is the state this was asked for, not a failure. Pressing twice
    // used to raise ENOENT onto a screen whose only button was the one just pressed.
    if (!existsSync(dir)) return null;
    const beside = dirname(dir);
    const name = archiveFolderName(now, (candidate) => existsSync(join(beside, candidate)));
    renameSync(dir, join(beside, name));
    return name;
  }

  /** Delete everything Cairn holds here and say what went: the vault, the vaults set
   *  aside beside it, its own log, and its own crash dumps -- a dump holds memory from
   *  the moment a process died, and an open vault is in that memory. */
  eraseEverything(): { vaults: number; dumps: boolean; logs: boolean } {
    this.lock();
    const dir = vaultDir();
    const beside = dirname(dir);
    let vaults = 0;

    if (existsSync(dir)) { rmSync(dir, { recursive: true, force: true }); vaults += 1; }
    for (const name of existsSync(beside) ? readdirSync(beside) : []) {
      if (!isSetAsideVault(name)) continue;
      rmSync(join(beside, name), { recursive: true, force: true });
      vaults += 1;
    }

    const dumps = existsSync(dumpDir());
    if (dumps) rmSync(dumpDir(), { recursive: true, force: true });
    const logs = existsSync(logDir());
    if (logs) rmSync(logDir(), { recursive: true, force: true });

    return { vaults, dumps, logs };
  }

  /** Move the vault, copying and checking before anything is removed and pointing
   *  Cairn at the new place last, so every way this fails leaves it where it was. */
  moveTo(destination: string, now = new Date()): string {
    this.lock();
    const from = vaultDir();
    if (!existsSync(from)) throw new Error('There is no vault here to move.');

    const target = join(destination, 'cairn-vault');
    if (existsSync(target)) {
      throw new Error(`There is already something at ${target}. Cairn will not write over it.`);
    }
    cpSync(from, target, { recursive: true });

    // What was copied is what is there, before the original is touched. A short copy
    // that reported success would be the whole vault gone.
    const counted = (dir: string): number =>
      readdirSync(dir, { withFileTypes: true })
        .reduce((n, entry) => n + (entry.isDirectory() ? counted(join(dir, entry.name)) : 1), 0);
    if (counted(target) !== counted(from)) {
      rmSync(target, { recursive: true, force: true });
      throw new Error('The copy did not come out whole, so nothing has been moved.');
    }

    rememberVaultAt(target);
    rmSync(from, { recursive: true, force: true });
    void now;
    return target;
  }

  /** Where it is, and whether that is somewhere Cairn was pointed at. */
  location(): { path: string; moved: boolean } {
    const path = vaultDir();
    return { path, moved: path !== defaultVaultDir() };
  }

  schemaVersion(): number {
    return MIGRATIONS.at(-1)?.id ?? 0;
  }

  sizeBytes(): number {
    return existsSync(vaultFile()) ? this.store.sizeBytes() : 0;
  }
}
