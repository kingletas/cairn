import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The status bar's outbound count is Cairn's central claim about itself, and it is
 *  only true if nothing can fetch around the gate. This is the check that keeps it
 *  true: exactly one file may call fetch, and that file is the gate. */
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

test('only the gate calls fetch', () => {
  const offenders = walk('src')
    .filter((file) => !file.endsWith(join('net', 'gate.ts')))
    .filter((file) => /(?<![.\w])fetch\s*\(/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(
    offenders, [],
    `These call fetch directly and would not be counted:\n  ${offenders.join('\n  ')}`,
  );
});

test('the gate refuses anything that is not https', async () => {
  const { fetchThrough } = await import('../../dist/main/net/gate.js');
  await assert.rejects(
    () => fetchThrough('http://example.test/jobs', 'test', {
      identifyAs: 'cairn', delayMs: 0, timeoutMs: 100, onRecord: () => {},
    }),
    /only speaks https/,
  );
});
