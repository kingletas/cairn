import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const settings = {
  maxPostingAgeDays: 30, requireFirstPartyPay: false, excludedEmployers: ['Quarry Data', 'Blue Heron'],
  harvestCadenceHours: null, requestDelayMs: 0, sequentialFetch: true,
  identifyAs: 'cairn', keepDroppedHashes: true, theme: 'system', accent: 'pine',
  density: 'comfortable', textSize: 'default', weekStartsOn: 'monday',
  lockAfterMinutes: null, chaseAfterDays: 10, lastHarvest: null,
};

const context = {
  profile: {
    displayName: 'T', locations: [], remoteOnly: false, currency: 'USD',
    payFloor: null, payTarget: null, skills: [], families: ['infrastructure'],
    workAuthorisation: null, needsSponsorship: null,
  },
  settings,
  titles: ['Platform Engineer'],
  knownUrls: new Set(), knownPairs: new Set(), droppedHashes: new Set(), now: new Date(),
};

const lead = (over) => ({
  company: 'Somebody Else', role: 'Platform Engineer', url: 'https://example.test/1',
  html: '<p>An ordinary posting.</p>', postedAt: new Date().toISOString(),
  statedPay: null, firstParty: true, ...over,
});

const exclusion = (result) => result.verdicts.find((v) => v.check === 'employer-excluded');

test('a name too short to be an employer is not kept', async () => {
  // One character matches the company field of nearly every posting there is, and it
  // would do it in silence -- the leads never arrive to say why they did not.
  const { normaliseExclusions } = await import('../../dist/main/screening/checks.js');
  assert.deepEqual(normaliseExclusions(['  Quarry Data  ', 'a', '', '  ']), ['Quarry Data']);
});

test('the same employer twice is stored once, whatever the capitals', async () => {
  const { normaliseExclusions } = await import('../../dist/main/screening/checks.js');
  assert.deepEqual(normaliseExclusions(['Blue Heron', 'blue heron', 'BLUE HERON']), ['Blue Heron']);
});

test('an employer you excluded never reaches the queue', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  const result = await screen(lead({ company: 'Quarry Data Ltd' }), context);
  assert.equal(exclusion(result).outcome, 'fail');
  assert.equal(result.clears, false, 'a lead from an excluded employer reached the queue');
});

test('a posting that only mentions them arrives flagged, with the sentence', async () => {
  // An agency names its client in the prose, and so does a posting that merely says who
  // it partners with. Dropping on a mention would take the second one invisibly.
  const { screen } = await import('../../dist/main/screening/checks.js');
  const result = await screen(lead({
    company: 'Recruiting Partners',
    html: '<p>We are hiring on behalf of Quarry Data. A great team.</p>',
  }), context);
  const verdict = exclusion(result);
  assert.equal(verdict.outcome, 'ask', 'a mention must be shown rather than acted on');
  assert.match(verdict.because, /Quarry Data/);
  assert.match(verdict.evidence, /on behalf of Quarry Data/, 'the sentence must be quoted');
  assert.equal(result.clears, true, 'a mention dropped the lead instead of flagging it');
  assert.ok(
    result.open.some((question) => /excluded/.test(question)),
    'the reader was not asked the question the flag exists to raise',
  );
});

test('an employer you said nothing about passes', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  const result = await screen(lead(), context);
  assert.equal(exclusion(result).outcome, 'pass');
  assert.equal(result.clears, true);
});

test('every screening setting can be changed by the person it screens for', () => {
  // Twice now a screen that can drop a lead outright has read a setting nothing in the
  // app could reach. The age one said "your 30-day limit" about an unasked number.
  const checks = readFileSync('src/main/screening/checks.ts', 'utf8');
  const screen = readFileSync('src/renderer/views/settings.ts', 'utf8');
  const keys = [...new Set([...checks.matchAll(/settings\.([a-zA-Z]+)/g)].map((m) => m[1]))];
  assert.ok(keys.length >= 4, 'the screening layer reads more settings than this found');
  // Mentioned by the settings screen at all: some are a row that names the key, and
  // the excluded employers are a panel of their own with a handler behind it.
  const unreachable = keys.filter((key) => !screen.includes(key));
  assert.deepEqual(unreachable, [],
    `these decide whether a lead reaches you, and nothing in the app can set them: ${unreachable.join(', ')}`);
});
