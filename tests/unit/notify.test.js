import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isQuiet, sameDay, dailySummary, alreadyTold } from '../../dist/main/notify.js';

/** What is worth interrupting somebody for, and when it is not. */
const at = (h, m = 0) => new Date(2026, 8, 8, h, m);

test('quiet hours that wrap past midnight are the ordinary case', () => {
  // 22:00 to 08:00 is what people set. Treating that as an empty range would say
  // nothing was ever quiet, which is the failure nobody notices until 3am.
  const night = { from: 22 * 60, to: 8 * 60 };
  assert.equal(isQuiet(at(23), night), true);
  assert.equal(isQuiet(at(3), night), true);
  assert.equal(isQuiet(at(7, 59), night), true);
  assert.equal(isQuiet(at(8), night), false);
  assert.equal(isQuiet(at(14), night), false);
});

test('quiet hours inside one day still work', () => {
  const lunch = { from: 12 * 60, to: 13 * 60 };
  assert.equal(isQuiet(at(12, 30), lunch), true);
  assert.equal(isQuiet(at(11), lunch), false);
  assert.equal(isQuiet(at(13), lunch), false);
});

test('setting them the same means no quiet hours at all', () => {
  assert.equal(isQuiet(at(3), { from: 0, to: 0 }), false);
  assert.equal(isQuiet(at(3), { from: 480, to: 480 }), false);
});

test('a day is the reader’s day, not UTC’s', () => {
  // A deadline at 23:00 on Friday is Friday to the person it belongs to.
  assert.equal(sameDay(at(23), at(1)), true);
  assert.equal(sameDay(at(23), new Date(2026, 8, 9, 1)), false);
});

test('one notice, not one per item', () => {
  // Five notifications about a job search is a channel people turn off, and the real
  // one goes with it.
  const things = [
    { kind: 'interview', at: at(15).toISOString(), title: 'First round', opportunityId: 'a' },
    { kind: 'due', at: at(9).toISOString(), title: 'Chase them', opportunityId: 'b' },
    { kind: 'due', at: new Date(2026, 8, 5, 9).toISOString(), title: 'Older', opportunityId: 'c' },
  ];
  const summary = dailySummary(things, at(8, 30));
  assert.equal(summary.title, 'An interview today');
  assert.match(summary.body, /1 interview today/);
  assert.match(summary.body, /1 thing due today/);
  assert.match(summary.body, /1 past due/);
});

test('a day with nothing due says nothing', () => {
  assert.equal(dailySummary([], at(9)), null);
  const later = [{ kind: 'due', at: new Date(2026, 8, 20, 9).toISOString(), title: 'Later', opportunityId: 'd' }];
  assert.equal(dailySummary(later, at(9)), null);
});

test('today is answered once, and a machine asleep past midnight is told when it wakes', () => {
  assert.equal(alreadyTold('2026-09-08', at(9)), true);
  assert.equal(alreadyTold('2026-09-07', at(9)), false);
  assert.equal(alreadyTold(null, at(9)), false);
});

test('nothing is said while the vault is locked, and nothing leaves the machine', () => {
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  const loop = /One notice a day[\s\S]*?\n {2}\}, DUE_CHECK_MS\)\.unref\(\);/.exec(handlers);
  assert.ok(loop !== null, 'the notice should ride the timer that is already there');
  assert.match(loop[0], /if \(!vault\.isUnlocked\) return;/);
  assert.match(loop[0], /if \(!settings\.notify\) return;/, 'it must be off until somebody asks');
  assert.ok(!/fetchThrough/.test(loop[0]), 'a reminder is not a request');
});
