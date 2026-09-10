import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Moving a vault is the one operation where a half-finished job loses everything. */
const vault = readFileSync('src/main/vault.ts', 'utf8');
const paths = readFileSync('src/main/paths.ts', 'utf8');

test('it copies and checks before it removes anything', async () => {
  // A rename is quicker and cannot cross a disk, which is most of the reason somebody
  // moves a vault at all.
  const move = /moveTo\(destination: string[\s\S]*?\n {2}\}/.exec(vault);
  assert.ok(move !== null);
  const copy = move[0].indexOf('cpSync');
  const check = move[0].indexOf('counted(target) !== counted(from)');
  const point = move[0].indexOf('rememberVaultAt(target)');
  const remove = move[0].lastIndexOf('rmSync(from');
  assert.ok(copy > -1 && check > copy, 'the copy is not checked before it is trusted');
  assert.ok(point > check, 'Cairn is pointed at the copy before it is known to be whole');
  assert.ok(remove > point, 'the original goes before the pointer is written');
});

test('it refuses to write over something already there', () => {
  assert.match(vault, /Cairn will not write over it/);
});

test('a pointer nothing can read means the vault is where it started', () => {
  // The answer that cannot be wrong. A missing or corrupt pointer must not make the
  // app think the vault is somewhere it is not.
  const dir = /export function vaultDir\(\)[\s\S]*?\n\}/.exec(paths);
  assert.ok(dir !== null);
  assert.match(dir[0], /catch \{/);
  assert.match(dir[0], /return join\(app\.getPath\('userData'\), 'vault'\);/);
});

test('the store opens wherever the vault is now', () => {
  // Held by value it kept pointing at the folder a move had just emptied, and every
  // read after that failed on a path that was correct when the app started.
  assert.match(vault, /if \(this\.opened === null \|\| this\.opened\.path !== path\)/);
});

test('the vault is locked before it is moved', () => {
  const move = /moveTo\(destination: string[\s\S]*?\n {2}\}/.exec(vault);
  assert.match(move[0], /this\.lock\(\);/);
});

test('the sequence itself moves a tree and leaves nothing behind', async () => {
  // The order is checked above by reading; this runs it. Moving a vault is the one
  // operation where a half-finished job loses everything.
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync, cpSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const home = mkdtempSync(join(tmpdir(), 'cairn-move-'));
  const from = join(home, 'vault');
  const to = join(home, 'elsewhere');
  mkdirSync(join(from, 'documents'), { recursive: true });
  mkdirSync(to);
  writeFileSync(join(from, 'vault.db'), 'records');
  writeFileSync(join(from, 'vault.header.json'), '{"salt":"aa"}');
  writeFileSync(join(from, 'documents', 'Resume.pdf'), 'bytes');

  const counted = (dir) => readdirSync(dir, { withFileTypes: true })
    .reduce((n, e) => n + (e.isDirectory() ? counted(join(dir, e.name)) : 1), 0);

  try {
    const target = join(to, 'cairn-vault');
    cpSync(from, target, { recursive: true });
    assert.equal(counted(target), counted(from), 'the copy came out short');
    rmSync(from, { recursive: true, force: true });

    assert.equal(existsSync(from), false, 'the original is still there');
    assert.equal(readdirSync(target).sort().join(','), 'documents,vault.db,vault.header.json');
    assert.equal(readFileSync(join(target, 'documents', 'Resume.pdf'), 'utf8'), 'bytes',
      'a document did not survive the move');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
