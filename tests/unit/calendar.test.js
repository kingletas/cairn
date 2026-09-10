import { test } from 'node:test';
import assert from 'node:assert/strict';
import { datedThings } from '../../dist/main/calendar.js';

/** Only the two methods datedThings reaches for. A real vault would test the database
 *  rather than what a day on the calendar is called. */
function repoWith(roles, interviews = []) {
  return { opportunities: () => roles, interviews: () => interviews };
}

const role = {
  id: 'r1', company: 'Tidewell', role: 'Staff Platform Engineer', url: null, location: null,
  remote: 'remote', pay: null, stage: 'considering', fit: null, family: 'platform',
  nextAction: 'Held to Monday 2026-09-08', nextActionDue: '2026-09-08', postedAt: null,
  capturedAt: '2026-09-04T00:00:00.000Z', appliedAt: null, resumeFile: null, resumeId: null,
  archivedAt: null, notes: null,
};

test('an action is labelled with the role, not with the action', () => {
  const [thing] = datedThings(repoWith([role]));
  // A grid of "Held to Monday" says nothing about who is being held, and every other
  // kind of entry names the employer.
  assert.equal(thing.title, 'Tidewell · Staff Platform Engineer');
  assert.equal(thing.detail, 'Held to Monday 2026-09-08');
});

test('an archived role is not on the calendar', () => {
  const things = datedThings(repoWith([{ ...role, archivedAt: '2026-09-01T00:00:00.000Z' }]));
  assert.deepEqual(things, []);
});

test('an action with no due date is not on the calendar', () => {
  assert.deepEqual(datedThings(repoWith([{ ...role, nextActionDue: null }])), []);
});

test('every kind of entry names the employer', () => {
  const things = datedThings(repoWith([{ ...role, appliedAt: '2026-08-26T00:00:00.000Z' }]));
  assert.equal(things.length, 2);
  for (const thing of things) assert.ok(thing.title.includes('Tidewell'), thing.title);
});
