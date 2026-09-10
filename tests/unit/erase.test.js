import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ERASE_PHRASE, saidErase, isSetAsideVault } from '../../dist/main/archive.js';

/** The one thing in Cairn with no way back. Everything here is about making that
 *  deliberate rather than reachable.
 */
test('the words have to be meant, not aimed at', () => {
  assert.equal(saidErase('erase everything'), true);
  assert.equal(saidErase('  Erase   Everything  '), true, 'spacing and case are not the point');
  assert.equal(saidErase('erase'), false);
  assert.equal(saidErase('erase everything please'), false);
  assert.equal(saidErase(''), false);
  assert.equal(saidErase('delete everything'), false);
});

test('a set-aside vault is recognised by the name this app gave it', () => {
  // Erasing walks the directory the vault sits in. Anything else in there is somebody
  // else's, and a loose pattern would take it.
  assert.equal(isSetAsideVault('vault-before-2026-09-08-14-17-39'), true);
  assert.equal(isSetAsideVault('vault-before-2026-09-08-14-17-39-2'), true);
  assert.equal(isSetAsideVault('vault'), false);
  assert.equal(isSetAsideVault('vault-before-notes'), false);
  assert.equal(isSetAsideVault('Documents'), false);
  assert.equal(isSetAsideVault('..'), false);
});

test('the phrase is checked again where the deleting happens', () => {
  // The interface decides what to offer and the main process decides what is allowed.
  // Nothing this final rests on one of those.
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.match(handlers, /if \(!saidErase\(typed\)\) throw/);
});

test('erasing takes the dumps and the log with it', () => {
  // A crash dump holds memory from the moment a process died, and an open vault is in
  // that memory. Leaving those would make the word "everything" untrue.
  const vault = readFileSync('src/main/vault.ts', 'utf8');
  const erase = /eraseEverything\(\)[\s\S]*?\n {2}\}/.exec(vault);
  assert.ok(erase !== null);
  assert.match(erase[0], /dumpDir\(\)/, 'the crash dumps stay behind');
  assert.match(erase[0], /logDir\(\)/, 'the log stays behind');
  assert.match(erase[0], /isSetAsideVault/, 'vaults set aside earlier stay behind');
  assert.match(erase[0], /this\.lock\(\)/, 'the key is still held while the file goes');
});

test('the phrase the screen asks for is the phrase the app checks', () => {
  // Two copies of a password are one typo from a button nobody can press.
  assert.equal(ERASE_PHRASE, 'erase everything');
  assert.match(readFileSync('src/renderer/views/privacy.ts', 'utf8'), /'erase everything'/);
});

test('it takes what it named and nothing beside it', async () => {
  // Erasing walks the directory the vault sits in, which on a real machine holds other
  // applications' folders. Taking one of those would be the worst bug in this file.
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const home = mkdtempSync(join(tmpdir(), 'cairn-erase-'));
  const make = (name) => { mkdirSync(join(home, name), { recursive: true }); writeFileSync(join(home, name, 'f'), 'x'); };
  for (const name of ['vault', 'vault-before-2026-09-08-14-17-39', 'vault-before-2026-09-08-14-17-49-2',
                      'logs', 'Crashpad', 'Cache', 'Local Storage', 'vault-before-notes']) make(name);

  // The same walk vault.ts performs, which reaches `electron` for its paths and so
  // cannot be imported here.
  let vaults = 0;
  if (existsSync(join(home, 'vault'))) { rmSync(join(home, 'vault'), { recursive: true, force: true }); vaults += 1; }
  for (const name of readdirSync(home)) {
    if (!isSetAsideVault(name)) continue;
    rmSync(join(home, name), { recursive: true, force: true });
    vaults += 1;
  }
  for (const own of ['logs', 'Crashpad']) rmSync(join(home, own), { recursive: true, force: true });

  try {
    assert.equal(vaults, 3, 'the vault and both set aside beside it');
    assert.deepEqual(readdirSync(home).sort(), ['Cache', 'Local Storage', 'vault-before-notes'],
      'it took something it did not name');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
