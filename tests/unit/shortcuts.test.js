import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Twelve views, nine digits, and the three left over. */
const shell = readFileSync('src/renderer/views/app.ts', 'utf8');

test('every view can be reached by a key, and no key reaches two', () => {
  // A view with no shortcut is one somebody keeps reaching for and missing; a key
  // claimed twice takes whichever the map happened to build last.
  const nav = [...shell.matchAll(/\{ id: '(\w+)', label: '[^']+', group: '\w+' \}/g)].map((m) => m[1]);
  assert.equal(nav.length, 12, 'the rail is twelve views; this test is written for that');

  const spare = [...shell.matchAll(/'([^']+)': '(\w+)'/g)]
    .filter(([, , id]) => nav.includes(id));
  const keys = new Map();
  nav.slice(0, 9).forEach((id, at) => keys.set(String(at + 1), id));
  for (const [, key, id] of spare) keys.set(key, id);

  assert.equal(keys.size, 12, 'every view should have exactly one key');
  assert.equal(new Set(keys.values()).size, 12, 'two views share a key');
});

test('settings takes the shortcut every application already uses for it', () => {
  // Rather than whichever number happened to be left over.
  assert.match(shell, /',': 'settings'/);
});

test('a shortcut is a plain modifier and a key, and nothing else', () => {
  // Ctrl+Shift+1 is a different thing in a lot of applications, and answering it here
  // would take it away from them.
  assert.match(shell, /if \(!\(event\.ctrlKey \|\| event\.metaKey\) \|\| event\.altKey \|\| event\.shiftKey\) return;/);
});

test('drawing the shell again replaces the listener rather than adding one', () => {
  // The shell is drawn on every unlock. One listener per unlock is one keypress
  // jumping several views.
  assert.match(shell, /if \(jumping !== null\) window\.removeEventListener\('keydown', jumping\);/);
});

test('the rail says which key reaches it', () => {
  assert.match(shell, /title: shortcutFor\(item\.id\)/);
});
