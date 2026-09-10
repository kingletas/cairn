import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inBatches } from '../../dist/renderer/components/paged.js';

/** Acting on a screenful at once. The rule that matters is which actions are refused:
 *  two stage moves each ask a question at the moment of the move, and a question asked
 *  of forty rows at once is a question nobody answers. */

test('every row is done, in the order it was listed, in batches', async () => {
  const seen = [];
  const rows = Array.from({ length: 45 }, (_, n) => n);
  await inBatches(rows, async (n) => { seen.push(n); });
  assert.equal(seen.length, 45);
  assert.deepEqual(seen.slice(0, 20).sort((a, b) => a - b), rows.slice(0, 20));
  assert.deepEqual([...seen].sort((a, b) => a - b), rows);
});

test('nothing to do is not an error', async () => {
  await inBatches([], async () => { throw new Error('should not run'); });
});

const source = (view) => readFileSync(`src/renderer/views/${view}.ts`, 'utf8');

test('the two stages that ask a question are not offered in bulk', () => {
  const pipeline = source('pipeline');
  assert.match(pipeline, /const movable: Stage\[\] = \['considering', 'preparing', 'interviewing'\];/);
  // Sending records a date, starts the clock on the silence and asks who a nudge goes
  // to; the last stage asks what actually happened. Neither survives being done to
  // forty rows at once.
  assert.doesNotMatch(pipeline, /movable[^\n]*'applied'/);
  assert.doesNotMatch(pipeline, /movable[^\n]*'decision'/);
});

test('every core list can act on more than one row', () => {
  for (const view of ['pipeline', 'requisitions', 'applications', 'preflight']) {
    assert.match(source(view), /bulk: \{|bulk: \{\n/, `${view} has no bulk actions`);
    assert.match(source(view), /keyOf:/, `${view} has no key for a row`);
  }
});

test('a tick belongs to a list, so changing lists drops it', () => {
  // A selection carried across a tab is a selection pointed at rows nobody can see.
  for (const view of ['pipeline', 'applications', 'preflight', 'requisitions']) {
    assert.match(source(view), /chosen\.clear\(\);/, `${view} keeps a stale selection`);
  }
});

test('nothing runs on a set until the set has been counted out loud', () => {
  const paged = readFileSync('src/renderer/components/paged.ts', 'utf8');
  assert.match(paged, /function askFirst/);
  assert.match(paged, /chosen\.asks\(count, said\)/, 'the confirm names the count');
  assert.match(paged, /const count = chosen\.counts \? chosen\.counts\(rows\) : rows\.length;/,
    'and the count is what will change, not what is listed');
  // Everything here is the dangerous scope, so it is named with its own count.
  assert.match(paged, /Everything here \$\{items\.length\}/);
});

test('a tick against the wrong row is worse than no tick', () => {
  const paged = readFileSync('src/renderer/components/paged.ts', 'utf8');
  assert.match(paged, /if \(drawn\.length !== shown\.length\) return;/);
});

test('a confirm promises what the action will do, not what the list holds', () => {
  // Preflight can list one role twice, so "132" was the findings and "66" was the roles
  // that would actually change. The number in front of somebody has to be the second.
  const preflight = readFileSync('src/renderer/views/preflight.ts', 'utf8');
  assert.equal((preflight.match(/counts: howManyRoles,/g) ?? []).length, 3,
    'every finding-based action counts roles');
});

test('one role under two checks is two findings and one write', () => {
  // Preflight lists a role once per check it fails, so the All tab can hold the same
  // role twice. Ticking one finding must not tick the other, and acting on both must
  // not write the row twice or count it as two.
  const preflight = readFileSync('src/renderer/views/preflight.ts', 'utf8');
  assert.match(preflight, /keyOf: \(\{ check, role \}\) => `\$\{check\.id\}:\$\{role\.id\}`/);
  assert.match(preflight, /function rolesIn/);
  for (const call of preflight.matchAll(/run: \(rows[^)]*\) =>\s*([^\n]*)/g)) {
    assert.match(call[1], /rolesIn\(rows\)/, 'every action has to fold the findings back into roles');
  }
});
