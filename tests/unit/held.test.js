import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** A linked file is not in the vault: not encrypted, not in an export, and gone the
 *  moment somebody moves it. Everything here is about not pretending otherwise.
 */
test('copying is the default, because it is the only one that keeps', async () => {
  const settings = JSON.parse(readFileSync('defaults/settings.json', 'utf8')).settings;
  assert.equal(settings.documentsHeld, 'copied');
  assert.match(readFileSync('src/main/repo.ts', 'utf8'), /documentsHeld: 'copied',/);
});

test('a record says how it is held rather than leaving it to be guessed from a path', () => {
  // An absolute path outside the vault and a vault-relative one are told apart by a
  // field, not by looking at the string and hoping.
  assert.match(readFileSync('src/shared/types.ts', 'utf8'), /held: 'copied' \| 'linked';/);
  assert.match(readFileSync('src/main/db/schema.ts', 'utf8'),
    /ALTER TABLE document ADD COLUMN held TEXT NOT NULL DEFAULT 'copied';/);
});

test('a linked file is resolved without the vault resolver, which would refuse it', () => {
  // `fromVaultRelative` throws on anything outside the vault. Running a linked path
  // through it is how a linked document became unopenable.
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.match(handlers,
    /record\.held === 'linked' \? record\.relativePath : fromVaultRelative\(record\.relativePath\)/);
});

test('a linked file that has gone says what happened', () => {
  // Silence here reads as a broken app rather than a moved file.
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.match(handlers, /is not at \$\{record\.relativePath\} any more/);
  assert.match(handlers, /moving or deleting it takes it away from Cairn too/);
});

test('nothing already held changes when the setting does', () => {
  // Turning on linking must not un-copy what is already encrypted in the vault.
  assert.match(readFileSync('src/renderer/views/settings.ts', 'utf8'),
    /What Cairn already holds is not changed by this/);
});

test('a version is always a file Cairn wrote, whatever the document is held as now', () => {
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  const reveal = /'documents:revealVersion'[\s\S]*?\n {2}\}\);/.exec(handlers);
  assert.ok(reveal !== null);
  assert.match(reveal[0], /fromVaultRelative\(version\.relativePath\)/);
});
