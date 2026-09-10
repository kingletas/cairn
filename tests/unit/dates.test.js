import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readableDue, isDueToday, startOfStoredDay, dayKey, daysFromToday,
} from '../../dist/renderer/components/dates.js';

// "Today" means the reader's calendar day, so these fixtures are built in local time.
// Writing them as Z would make the suite pass or fail depending on which side of
// midnight the runner's timezone puts them -- which is a real trap, not a test bug.
const localNoon = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0);
const localAt = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0).toISOString();
// A calendar day, in local time, for the checks about date-only values below.
const local = (y, m, d) => new Date(y, m - 1, d).getTime();

test('a due date is never shown as a timestamp', () => {
  const now = localNoon(2026, 9, 7);
  assert.equal(readableDue(localAt(2026, 9, 7, 20), now), 'Today');
  assert.equal(readableDue(localAt(2026, 9, 8, 9), now), 'Tomorrow');
  assert.equal(readableDue(localAt(2026, 9, 6, 9), now), 'Yesterday');
  assert.equal(readableDue(localAt(2026, 9, 4, 9), now), 'Overdue by 3 days');
  assert.equal(readableDue(null, now), 'No date set');
});

test('an unreadable date says so rather than showing its own failure', () => {
  assert.equal(readableDue('not a date', localNoon(2026, 9, 7)), 'No date set');
});

test('anything due today or earlier reads as due', () => {
  const now = localNoon(2026, 9, 7);
  assert.equal(isDueToday(localAt(2026, 9, 7, 23), now), true);
  assert.equal(isDueToday(localAt(2026, 9, 1, 0), now), true);
  assert.equal(isDueToday(localAt(2026, 9, 8, 0), now), false);
  assert.equal(isDueToday(null, now), false);
});

test('a date-only value is the day it names, not UTC midnight', () => {
  assert.equal(startOfStoredDay('2026-08-11'), local(2026, 8, 11));
  assert.equal(dayKey('2026-08-11'), '2026-7-11');
});

test('a value carrying a time stays a moment', () => {
  // An interview is a point in time, not a day somebody wrote down, so it is read in
  // local time -- which is the evening before, west of Greenwich.
  const at = new Date('2026-09-11T00:30:00.000Z');
  assert.equal(dayKey(at.toISOString()), `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`);
});

test('a date-only value and the same day as a local timestamp agree', () => {
  assert.equal(dayKey('2026-08-11'), dayKey(new Date(local(2026, 8, 11) + 3600_000).toISOString()));
});

test('days are counted between calendar days, not between instants', () => {
  const now = new Date(local(2026, 9, 9) + 23 * 3600_000);   // late on the 9th
  assert.equal(daysFromToday('2026-09-10', now), 1);
  assert.equal(daysFromToday('2026-09-09', now), 0);
  assert.equal(daysFromToday('2026-08-28', now), -12);
});

test('overdue counts the days it is actually overdue by', () => {
  const now = new Date(local(2026, 9, 9));
  assert.equal(readableDue('2026-08-28', now), 'Overdue by 12 days');
  assert.equal(readableDue('2026-09-09', now), 'Today');
  assert.equal(readableDue('2026-09-10', now), 'Tomorrow');
  assert.equal(readableDue('2026-09-08', now), 'Yesterday');
});

test('a weekday inside the week carries its date', () => {
  const now = new Date(local(2026, 9, 9));
  const said = readableDue('2026-09-11', now);
  const weekday = new Date(local(2026, 9, 11)).toLocaleDateString(undefined, { weekday: 'long' });
  // The weekday alone leaves the reader asking which one.
  assert.ok(said.includes(weekday), said);
  assert.ok(said.includes('11'), said);
});

test('nothing is due when there is no date', () => {
  assert.equal(readableDue(null), 'No date set');
  assert.equal(isDueToday(null), false);
  assert.equal(startOfStoredDay('not a date'), null);
  assert.equal(dayKey('not a date'), null);
});

test('due today counts today and anything past it', () => {
  const now = new Date(local(2026, 9, 9));
  assert.equal(isDueToday('2026-09-09', now), true);
  assert.equal(isDueToday('2026-09-01', now), true);
  assert.equal(isDueToday('2026-09-10', now), false);
});
