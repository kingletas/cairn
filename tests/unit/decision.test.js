import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pipeline = readFileSync('src/renderer/views/pipeline.ts', 'utf8');

/** Reaching the last stage is not an outcome: offered, turned down and withdrawn all
 *  land in the same column, and a month later the row cannot say which it was. */

test('a role cannot reach the last stage without saying what happened', () => {
  // Both ways in: the button on a row, and a card dragged into the column.
  assert.match(pipeline, /if \(advance === 'decision'\) \{ askDecision/);
  assert.match(pipeline, /if \(to === 'decision'\) \{[\s\S]{0,200}askDecision/);
});

test('the answers are the ones that already move a role on their own', () => {
  // offer goes to the last stage; a refusal or a withdrawal leaves the pipeline. Adding
  // a stage change beside the event would be two writes disagreeing about one thing.
  for (const kind of ["'offer'", "'rejected'", "'withdrawn'"]) {
    assert.match(pipeline, new RegExp(`record\\(${kind}`), `${kind} should be an answer`);
  }
  assert.match(pipeline, /'Not decided yet', \(\) => record\(null, null\)/,
    'and not deciding is an answer too, or the panel is a trap');
});

test('not deciding moves the role and records nothing', () => {
  assert.match(pipeline, /if \(kind === null\) \{[\s\S]{0,180}stage: 'decision'/);
});

test('sending asks about the gate, and does not refuse', () => {
  // An application sent before the gate existed is a real thing, and Preflight already
  // records the ones that went without one. Asking is the difference between a decision
  // and an accident.
  assert.match(pipeline, /const settled = state === 'run' \|\| state === 'retrofitted';/);
  assert.match(pipeline, /'Send it anyway'/);
  assert.match(pipeline, /'Run the gate first'/);
});

test('sending is the sitting the contact is asked for', () => {
  // A posting names its poster and a taken-down posting names nobody, so the one step
  // of the follow-up that belongs here is the one that stops being answerable later.
  assert.match(pipeline, /'Who a nudge goes to'/);
  assert.match(pipeline, /'How it travels'/);
  // And a role that already has one is not asked twice.
  assert.match(pipeline, /if \(settled && reachable\) \{ markSent\(o, null, null\); return; \}/);
});

test('adding a role by hand is folded', () => {
  // The rarest thing on the screen was taking the room at the foot of every one.
  assert.match(pipeline, /el\('details', \{ class: 'panel addrole', id: 'addrole' \}/);
  assert.match(pipeline, /panel\.open = true/, 'and the way to it opens it');
});

test('the board uses the same shape control as every other list', () => {
  assert.match(pipeline, /class: 'btn shape shape-board'/);
  assert.doesNotMatch(pipeline, /'View as list'/, 'no list should still name the move in words');
});
