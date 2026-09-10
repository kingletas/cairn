import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as mask from '../../dist/renderer/mask.js';

/** What somebody would not want on a shared screen. The role stays: a demonstration is
 *  about how the app works, and who you are talking to and what they pay is not.
 */
test('off by default, and nothing is touched', () => {
  mask.setScreenShare(false);
  assert.equal(mask.company('Quarry Data'), 'Quarry Data');
  assert.equal(mask.amounts('$150,000–$180,000 · they published it'), '$150,000–$180,000 · they published it');
});

test('an employer goes, and every employer looks the same', () => {
  // A row that changes width when the switch goes on is a row somebody can measure.
  mask.setScreenShare(true);
  assert.equal(mask.company('Quarry Data'), mask.company('A'));
  assert.doesNotMatch(mask.company('Quarry Data'), /Quarry/);
  mask.setScreenShare(false);
});

test('a figure goes and the sentence around it stays', () => {
  // That an employer published a band is not private; the band is.
  mask.setScreenShare(true);
  const line = mask.amounts('$150,000–$180,000 a year · they published it');
  assert.doesNotMatch(line, /150|180/);
  assert.match(line, /they published it/);
  assert.match(mask.amounts('The top of the range is under your floor.'),
    /The top of the range is under your floor\./);
  mask.setScreenShare(false);
});

test('every screen that draws an employer goes through the mask', () => {
  // One screen left out is the one somebody is looking at when it matters. Checked by
  // reading, because a mask nobody applied still passes every test of its own.
  const views = readdirSync('src/renderer/views').filter((f) => f.endsWith('.ts'));
  const missed = [];
  for (const file of views) {
    const body = readFileSync(join('src/renderer/views', file), 'utf8');
    // A view that renders somebody's company, rather than one that only reads a form.
    const draws = /el\([^)]*\}?,\s*[^)]*\.company\b/.test(body)
      || /\$\{[a-z]+\.company\}/.test(body);
    if (draws && !body.includes('mask.company(')) missed.push(file);
  }
  assert.deepEqual(missed, [], 'these draw an employer without masking it');
});

test('the switch is somewhere nobody has to go looking', () => {
  // It is pressed when a call has already started.
  assert.match(readFileSync('src/renderer/views/app.ts', 'utf8'), /Mask for sharing/);
  assert.match(readFileSync('src/renderer/views/settings.ts', 'utf8'), /Mask for sharing/);
});

test('it is remembered in the vault, not in the window', () => {
  // A lock, a redraw or a restart must not quietly unmask a screen somebody is sharing.
  assert.match(readFileSync('src/shared/types.ts', 'utf8'), /screenShare: boolean;/);
  assert.match(readFileSync('src/main/repo.ts', 'utf8'), /screenShare: false,/);
});
