import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atEmployer } from '../../dist/main/employer.js';

/** Question six exists because a second application to the same employer can clear
 *  every other check while the first one is still open. */

const role = (over) => ({
  id: 'a', company: 'Hollis Health', role: 'Staff Site Reliability Engineer', url: null,
  location: null, remote: 'remote', pay: null, stage: 'applied', fit: null, family: null,
  nextAction: null, nextActionDue: null, postedAt: null, capturedAt: '2026-08-01',
  appliedAt: '2026-09-04', resumeFile: null, resumeId: null, archivedAt: null, notes: null,
  gate: null, blocker: null, concession: null, contact: null, followupChannel: null,
  posting: null, screening: null, ...over,
});

const none = new Map();

test('one employer written two ways is one employer', () => {
  // The exclusion screen has always read a name this way; the check written because
  // one employer got two applications was matching the strings.
  const live = [role({ id: 'a', company: 'Hollis Health, Inc.' })];
  const at = atEmployer(live, none, 'Hollis Health', 'b');
  assert.equal(at.live.length, 1);

  const amp = atEmployer([role({ id: 'a', company: 'Stone & Rowe' })], none, 'Stone and Rowe', 'b');
  assert.equal(amp.live.length, 1);
});

test('a different employer with a shared first word is a different employer', () => {
  const at = atEmployer([role({ company: 'Hollis Labs' })], none, 'Hollis Health', 'b');
  assert.equal(at.live.length, 0);
});

test('the role you are looking at is never counted against itself', () => {
  const at = atEmployer([role({ id: 'a' })], none, 'Hollis Health', 'a');
  assert.equal(at.live.length, 0);
});

test('nothing sent is nothing live', () => {
  const at = atEmployer([role({ id: 'a', appliedAt: null })], none, 'Hollis Health', 'b');
  assert.equal(at.live.length, 0);
});

test('an employer that has turned you down is said, and is not live', () => {
  // Applying again the same week reads as not having heard the answer, and it was the
  // one part of question six nothing could answer -- a refusal is archived, and
  // archived rows were left out of the lookup entirely.
  const turned = role({ id: 'a', archivedAt: '2026-09-06' });
  const events = new Map([['a', { id: 'e', opportunityId: 'a', at: '2026-09-06', kind: 'rejected', detail: null }]]);
  const at = atEmployer([turned], events, 'Hollis Health', 'b');
  assert.equal(at.live.length, 0, 'a closed row is not competing with anything');
  assert.equal(at.declined.length, 1);
  assert.equal(at.declined[0].at, '2026-09-06');
});

test('a role you withdrew from is not the employer declining you', () => {
  const gone = role({ id: 'a', archivedAt: '2026-09-06' });
  const events = new Map([['a', { id: 'e', opportunityId: 'a', at: '2026-09-06', kind: 'withdrawn', detail: null }]]);
  const at = atEmployer([gone], events, 'Hollis Health', 'b');
  assert.deepEqual(at.declined, []);
});

test('the newest application is first, because it is the one being read against', () => {
  const rows = [
    role({ id: 'a', role: 'Senior', appliedAt: '2026-09-01' }),
    role({ id: 'b', role: 'Staff', appliedAt: '2026-09-04' }),
  ];
  const at = atEmployer(rows, none, 'Hollis Health', 'c');
  assert.deepEqual(at.live.map((o) => o.role), ['Staff', 'Senior']);
});
