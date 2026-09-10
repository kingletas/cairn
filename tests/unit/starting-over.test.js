import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveFolderName } from '../../dist/main/archive.js';

/** Starting over moves the vault rather than deleting it, so the name it moves to is
 *  the whole safety net. Two of these landing on one name would be the second quietly
 *  destroying the first, which is the single thing the path exists to avoid. */
test('the vault steps aside under a dated name', () => {
  const name = archiveFolderName(new Date('2026-09-08T01:23:45Z'), () => false);
  assert.equal(name, 'vault-before-2026-09-08-01-23-45');
});

test('a name already taken is never handed out twice', () => {
  const taken = new Set(['vault-before-2026-09-08-01-23-45', 'vault-before-2026-09-08-01-23-45-2']);
  const name = archiveFolderName(new Date('2026-09-08T01:23:45Z'), (candidate) => taken.has(candidate));
  assert.equal(name, 'vault-before-2026-09-08-01-23-45-3');
  assert.ok(!taken.has(name), 'the name it chose would have overwritten an earlier vault');
});

test('it gives up rather than looping for ever', () => {
  assert.throws(() => archiveFolderName(new Date(), () => true), /thousand/);
});

test('setting a vault aside twice is not an error the second time', async () => {
  // The first press moved it and the second raised ENOENT onto a screen whose only
  // button was the one just pressed, so there was no way out of it.
  const { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { renameSync } = await import('node:fs');

  const home = mkdtempSync(join(tmpdir(), 'cairn-over-'));
  const dir = join(home, 'vault');
  mkdirSync(dir);
  writeFileSync(join(dir, 'vault.db'), 'x');

  // The move itself, as vault.ts performs it. The module reaches `electron` for the
  // path, so the behaviour is exercised here rather than the class imported.
  const setAside = (now) => {
    if (!existsSync(dir)) return null;
    const name = archiveFolderName(now, (c) => existsSync(join(home, c)));
    renameSync(dir, join(home, name));
    return name;
  };

  try {
    assert.equal(typeof setAside(new Date('2026-09-08T14:17:39Z')), 'string');
    assert.equal(setAside(new Date('2026-09-08T14:17:49Z')), null,
      'a second press should report there is nothing to move, not throw');
    assert.equal(readdirSync(home).length, 1, 'the first vault must still be the only one set aside');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('the vault module reports nothing-to-move rather than raising', async () => {
  // Read rather than run, because vault.ts reaches `electron` through paths.ts and
  // cannot be imported by a test at all.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync('src/main/vault.ts', 'utf8');
  assert.match(source, /if \(!existsSync\(dir\)\) return null;/,
    'startOver must return rather than rename a directory that is not there');
});
