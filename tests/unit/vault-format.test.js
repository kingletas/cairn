import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A vault that will not open has two very different causes, and one of them is not
 *  the person's fault. Telling them apart is the whole of this file.
 */
const KEY = 'a'.repeat(64);

function vaultThatWillNotOpen(format) {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-format-'));
  const header = { version: 1, salt: '0'.repeat(32), createdAt: new Date().toISOString() };
  if (format !== null) header.format = format;
  writeFileSync(join(dir, 'vault.header.json'), JSON.stringify(header));
  writeFileSync(join(dir, 'vault.db'), Buffer.from('not an encrypted database at all'));
  return dir;
}

test('a vault from before the format change says so, rather than blaming the passphrase', async () => {
  // The library's encrypted format changed under us. "That passphrase did not open the
  // vault" sends somebody to reset something that is right, and their records are still
  // readable by the version that wrote them.
  const { Store } = await import('../../dist/main/db/store.js');
  const dir = vaultThatWillNotOpen(null);
  try {
    assert.throws(() => new Store(join(dir, 'vault.db')).open(KEY), /written by an older Cairn/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a vault this version wrote blames the passphrase, because that is what it is', async () => {
  const { Store } = await import('../../dist/main/db/store.js');
  const dir = vaultThatWillNotOpen(2);
  try {
    assert.throws(() => new Store(join(dir, 'vault.db')).open(KEY), /passphrase did not open/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a vault this version creates records the format it wrote', async () => {
  // Without this the next format change cannot tell an old vault from a new one, and
  // the message above becomes a guess again.
  const { Store } = await import('../../dist/main/db/store.js');
  const { readFileSync } = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'cairn-format-'));
  try {
    const store = new Store(join(dir, 'vault.db'));
    store.writeHeader('0'.repeat(32));
    const header = JSON.parse(readFileSync(join(dir, 'vault.header.json'), 'utf8'));
    assert.equal(typeof header.format, 'number');
    assert.ok(header.format >= 2, 'the format this build writes should be recorded');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('every vault format has a section in the upgrading guide', async () => {
  // A breaking change nobody wrote down is one the person meets on the lock screen with
  // nowhere to go. The constant and the guide cannot drift apart while this runs.
  const { readFileSync } = await import('node:fs');
  const store = readFileSync('src/main/db/store.ts', 'utf8');
  const declared = /const FORMAT = (\d+)/.exec(store);
  assert.ok(declared !== null, 'store.ts should declare the format it writes');

  const guide = readFileSync('docs/upgrading.md', 'utf8');
  const missing = [];
  for (let from = 1; from < Number(declared[1]); from += 1) {
    if (!guide.includes(`Vault format ${from} → ${from + 1}`)) missing.push(`${from} → ${from + 1}`);
  }
  assert.deepEqual(missing, [], 'these format changes have no section in docs/upgrading.md');
});

test('the guide is reachable from the readme and the changelog', async () => {
  const { readFileSync } = await import('node:fs');
  for (const file of ['README.md', 'CHANGELOG.md']) {
    assert.match(readFileSync(file, 'utf8'), /docs\/upgrading\.md/,
      `${file} should point at the upgrading guide, or nobody finds it`);
  }
});
