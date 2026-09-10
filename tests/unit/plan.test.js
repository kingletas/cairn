import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planHarvest, searchTerms, MAX_SEARCH_TERMS } from '../../dist/main/plan.js';

const FAMILIES = JSON.parse(readFileSync('defaults/families.json', 'utf8')).families;

const ats = { kind: 'ats', searchless: false };
const KINDS = new Map([
  ['greenhouse', ats], ['lever', ats], ['ashby', ats], ['smartrecruiters', ats],
  ['remotive', { kind: 'aggregator', searchless: false }],
  ['arbeitnow', { kind: 'aggregator', searchless: true }],
]);

const source = (id, enabled) => ({ id, enabled, lastRun: null, lastError: null, boards: 0 });
const board = (sourceId, token, company) => ({ sourceId, token, company, addedAt: '2026-09-07T00:00:00Z' });

const profile = (families = ['platform']) => ({
  displayName: 'Tester', locations: [], remoteOnly: false, currency: 'USD',
  payFloor: null, payTarget: null, skills: [], families,
  workAuthorisation: null, needsSponsorship: null,
});

test('a listing site runs on search terms and needs no board', () => {
  // This is the bug this file exists for: targets were built only from boards, so
  // turning on a listing site did nothing, for ever, and said nothing about why.
  const plan = planHarvest([source('remotive', true)], KINDS, [], profile(), FAMILIES);
  assert.ok(plan.targets.length > 0, 'a listing site with no board still has work to do');
  assert.ok(plan.targets.every((t) => t.sourceId === 'remotive'));
  assert.deepEqual(plan.blocked, []);
});

test("an employer's board needs a board, and says where to add one", () => {
  // The form used to be on the same page, so the message said "below". It is a
  // section away now, and a direction that points at nothing is worse than none.
  const plan = planHarvest([source('greenhouse', true)], KINDS, [], profile(), FAMILIES);
  assert.deepEqual(plan.targets, []);
  assert.equal(plan.blocked.length, 1);
  assert.match(plan.blocked[0].because, /Employers/);
  assert.doesNotMatch(plan.blocked[0].because, /below/,
    'the message points at a panel that is no longer on this page');
});

test('a listing site with nothing to search for says that instead', () => {
  const plan = planHarvest([source('remotive', true)], KINDS, [], profile([]), FAMILIES);
  assert.deepEqual(plan.targets, []);
  assert.match(plan.blocked[0].because, /kinds of work/);
});

test('a source that is off is neither run nor complained about', () => {
  const plan = planHarvest(
    [source('greenhouse', false), source('remotive', false)], KINDS, [], profile(), FAMILIES);
  assert.deepEqual(plan.targets, []);
  assert.deepEqual(plan.blocked, []);
});

test('both kinds run together, each on what it needs', () => {
  const plan = planHarvest(
    [source('greenhouse', true), source('remotive', true)],
    KINDS,
    [board('greenhouse', 'northwind', 'Northwind Systems')],
    profile(), FAMILIES,
  );
  const bySource = new Map();
  for (const t of plan.targets) bySource.set(t.sourceId, (bySource.get(t.sourceId) ?? 0) + 1);
  assert.equal(bySource.get('greenhouse'), 1, 'one board, one request');
  assert.ok((bySource.get('remotive') ?? 0) > 1, 'a search runs over several titles');
  assert.deepEqual(plan.blocked, []);
});

test('the number of requests is known before any are made', () => {
  const plan = planHarvest(
    [source('greenhouse', true)], KINDS,
    [board('greenhouse', 'a', 'A'), board('greenhouse', 'b', 'B')],
    profile(), FAMILIES,
  );
  assert.equal(plan.requests, 2);
  assert.equal(plan.requests, plan.targets.length);
});

test('one run never becomes two dozen searches', () => {
  // Past the cap the extra terms find the same roles again and the run takes long
  // enough to look broken.
  const terms = searchTerms(profile(['platform', 'software', 'data', 'security']), FAMILIES);
  assert.ok(terms.length <= MAX_SEARCH_TERMS, `${terms.length} terms`);
});

test('two interests both get searched, rather than the first taking every slot', () => {
  const terms = searchTerms(profile(['platform', 'design']), FAMILIES);
  const infra = FAMILIES.find((f) => f.id === 'platform').titles;
  const design = FAMILIES.find((f) => f.id === 'design').titles;
  assert.ok(terms.some((t) => infra.includes(t)), 'nothing from the first family');
  assert.ok(terms.some((t) => design.includes(t)), 'nothing from the second family');
});

test('a feed with no search parameter is fetched once, not once per title', () => {
  // It hands back the same list every time. Six requests for one answer, in an app
  // whose whole claim is that it counts what it sends.
  const plan = planHarvest([source('arbeitnow', true)], KINDS, [], profile(), FAMILIES);
  assert.equal(plan.requests, 1);
  assert.equal(plan.targets[0].sourceId, 'arbeitnow');
});

test('a source Cairn cannot read is named rather than skipped', () => {
  const plan = planHarvest([source('something-else', true)], KINDS, [], profile(), FAMILIES);
  assert.equal(plan.blocked.length, 1);
  assert.match(plan.blocked[0].because, /no reader/);
});
