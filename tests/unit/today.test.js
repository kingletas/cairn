import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const today = readFileSync('src/renderer/views/today.ts', 'utf8');

/** Today was a summary of the pipeline when it needed to be a worklist: three of
 *  fifty-three overdue actions, and four counts where two of them contained each
 *  other. */

test('the day is on the page', () => {
  // It said "Today" and never which day, and the interview line gave a weekday and a
  // time with no date on the one row where the date decides whether you turn up.
  assert.match(today, /class: 'daystamp'/);
  assert.match(today, /weekday: 'long', day: 'numeric', month: 'long'/);
  assert.match(today, /weekday: 'long', day: 'numeric', month: 'short'/);
});

test('work is grouped by what kind of work it is, not by date', () => {
  for (const id of ['due', 'overdue', 'ready', 'finish', 'chase']) {
    assert.match(today, new RegExp(`id: '${id}'`), `${id} should be its own pile`);
  }
  // A pile with nothing in it is not a heading worth drawing.
  assert.match(today, /groups\.filter\(\(group\) => group\.rows\.length > 0\)/);
});

test('preflight reaches the front page, and only when it has something', () => {
  // A screen somebody has to remember to open is the failure it exists to prevent.
  assert.match(today, /import \{ CHECKS \} from '\.\/preflight\.js'/);
  assert.match(today, /if \(found\.length === 0\) return;/);
});

test('the two headline counts do not contain each other', () => {
  // "156 live" and "66 sent" overlapped, and neither said what to do. One of these is
  // your work and the other is not.
  assert.match(today, /'Waiting on you'/);
  assert.match(today, /'Waiting on them'/);
  assert.doesNotMatch(today, /'Live opportunities'/);
});

test('a typical reply is the middle one, not the mean', () => {
  // Two employers that answer after four months would drag a mean somewhere useless.
  assert.match(today, /function median/);
  assert.match(today, /sorted\.length % 2 === 0/);
});
