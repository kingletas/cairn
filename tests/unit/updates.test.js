import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newerRelease, tagFrom } from '../../dist/main/updates.js';

/** Looking for a newer Cairn. It looks when asked, says what it found, and installs
 *  nothing — a new version is something a person fetches and runs.
 */
test('a newer tag is newer, and an older one is not', () => {
  assert.equal(newerRelease('0.1.0', 'v0.2.0'), 'v0.2.0');
  assert.equal(newerRelease('0.1.0', '0.1.1'), '0.1.1');
  assert.equal(newerRelease('0.1.0', '1.0.0'), '1.0.0');
  assert.equal(newerRelease('0.2.0', 'v0.1.9'), null);
  assert.equal(newerRelease('0.1.0', '0.1.0'), null);
  assert.equal(newerRelease('0.1.0', 'v0.1.0'), null, 'a leading v is not a new version');
});

test('a version with fewer parts is compared as though the rest were zero', () => {
  assert.equal(newerRelease('0.1', '0.1.0'), null);
  assert.equal(newerRelease('0.1', '0.1.1'), '0.1.1');
  assert.equal(newerRelease('1', '1.0.1'), '1.0.1');
});

test('a tag Cairn cannot read is not an update', () => {
  // Saying nothing beats telling somebody to upgrade because a release was named
  // something unexpected.
  assert.equal(newerRelease('0.1.0', 'nightly'), null);
  assert.equal(newerRelease('0.1.0', '2026-09-08'), null);
  assert.equal(newerRelease('0.1.0', ''), null);
});

test('the tag is read out of what the server actually sent', () => {
  assert.equal(tagFrom('{"tag_name":"v0.2.0"}'), 'v0.2.0');
  assert.equal(tagFrom('{"message":"Not Found"}'), null);
  assert.equal(tagFrom('not json'), null);
  assert.equal(tagFrom('{"tag_name":42}'), null);
});

test('the check goes through the one function that reaches the network', () => {
  // The count in the status bar is the app's central claim. A request that went around
  // it would make that count a lie about the one thing it is there to prove.
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  const check = /'updates:check'[\s\S]*?\n {2}\}\);/.exec(handlers);
  assert.ok(check !== null);
  assert.match(check[0], /fetchThrough\(/);
  assert.match(check[0], /onRecord: \(record\) => r\.recordOutbound\(record\)/);
});

test('nothing checks on a schedule, and nothing installs itself', () => {
  // The specification had update checks calling themselves the only scheduled request
  // while harvesting polled every three hours. Nothing is scheduled, so nothing can.
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.ok(!/autoUpdater|electron-updater|downloadUpdate/.test(handlers),
    'a new version is something a person fetches and runs');
  const settings = readFileSync('src/renderer/views/settings.ts', 'utf8');
  assert.match(settings, /looks when you press this and never on its own/);
});
