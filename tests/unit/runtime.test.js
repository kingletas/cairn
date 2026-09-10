import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The database is a native binding compiled for one runtime's ABI, and Electron's is
 *  not the system Node's. The whole suite once passed under plain Node while the app
 *  could not open a vault at all -- every database test was exercising a configuration
 *  the app never runs in, and nothing said so.
 */
test('the tests run on the same runtime as the app', () => {
  assert.ok(
    process.versions.electron !== undefined,
    'This suite must run under Electron, not the system Node. Use `npm test`, which sets ' +
      'ELECTRON_RUN_AS_NODE=1 — the database module is built for Electron\'s ABI and plain ' +
      'Node cannot load it.',
  );
});

test('the database module actually loads and can open an encrypted file', async () => {
  // The binding loads lazily, so a module built for the wrong ABI imports cleanly and
  // fails at the first query. A real file, because an in-memory database takes no key.
  const { default: Database } = await import('better-sqlite3-multiple-ciphers');
  const { mkdtempSync, rmSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dir = mkdtempSync(join(tmpdir(), 'cairn-runtime-'));
  const path = join(dir, 'probe.db');
  try {
    const db = new Database(path);
    db.pragma("cipher='chacha20'");
    db.pragma(`key="x'${'ab'.repeat(32)}'"`);
    db.exec('CREATE TABLE probe (a TEXT)');
    db.prepare('INSERT INTO probe (a) VALUES (?)').run('a recognisable string');
    assert.equal(db.prepare('SELECT a FROM probe').get().a, 'a recognisable string');
    db.close();

    const raw = readFileSync(path);
    assert.ok(!raw.includes(Buffer.from('a recognisable string')), 'the file is not encrypted');
    assert.ok(!raw.subarray(0, 15).toString('latin1').startsWith('SQLite'),
      'the file carries a plain SQLite header, so it is not encrypted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the key module loads on this runtime too', async () => {
  const { readdirSync } = await import('node:fs');
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const built = readdirSync('native').find((n) => n.endsWith('.node'));
  assert.ok(built, 'the key module is not built — run `npm run native`');
  const keyring = require(`../../native/${built}`);
  assert.equal(typeof keyring.newSalt(), 'string');
});

test('every native dependency is rebuilt by the build, not by hand', () => {
  // A step somebody has to remember is a step that gets skipped, and this one fails
  // at the passphrase prompt rather than at the build.
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts.build, /rebuild/,
    'npm run build must rebuild native modules for Electron');
  assert.match(pkg.scripts.test, /ELECTRON_RUN_AS_NODE/,
    'npm test must run on Electron, or it tests a runtime the app never uses');
});
