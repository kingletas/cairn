import { test } from 'node:test';
import assert from 'node:assert/strict';

/** What the queue reads, and what happens to it afterwards. Every case here is one a
 *  walk through the app found: a hard screen passing on a currency it misread, and the
 *  whole of the reading being dropped at the moment a lead becomes a role. */

const settings = {
  maxPostingAgeDays: 30, requireFirstPartyPay: false, excludedEmployers: [],
  harvestCadenceHours: null, requestDelayMs: 0, sequentialFetch: false,
  identifyAs: 'cairn', keepDroppedHashes: true, theme: 'system', accent: 'pine',
  density: 'comfortable', textSize: 'default', weekStartsOn: 'monday',
  lockAfterMinutes: null, chaseAfterDays: 10, lastHarvest: null,
};

const profile = (over) => ({
  displayName: 'T', locations: [], remoteOnly: false, currency: 'USD',
  payFloor: 170000, payTarget: null, skills: [], families: ['infrastructure'],
  workAuthorisation: null, needsSponsorship: null, ...over,
});

const context = (over) => ({
  profile: profile(over?.profile), settings: { ...settings, ...over?.settings },
  titles: ['Platform Engineer'],
  knownUrls: over?.knownUrls ?? new Set(),
  knownPairs: over?.knownPairs ?? new Set(),
  droppedHashes: new Set(), now: new Date(),
});

const lead = (over) => ({
  company: 'Quarry Data', role: 'Platform Engineer', url: 'https://example.test/1',
  html: '<p>An ordinary posting.</p>', postedAt: new Date().toISOString(),
  statedPay: null, firstParty: true, ...over,
});

const find = (result, check) => result.verdicts.find((v) => v.check === check);

// --- the currency ---------------------------------------------------------

test('a currency named after the figures beats a symbol before them', async () => {
  const { parsePay } = await import('../../dist/main/screening/pay.js');
  // The symbol is the half that cannot tell you which dollar it is.
  assert.equal(parsePay('The range is $155,000—$220,000 CAD per year.', 'first-party').currency, 'CAD');
  assert.equal(parsePay('Compensation is 155,000—220,000 CAD annually.', 'first-party').currency, 'CAD');
  assert.equal(parsePay('Salary: CAD 155,000 to 220,000 per year.', 'first-party').currency, 'CAD');
});

test('a range in no stated currency is not quietly read as yours', async () => {
  const { parsePay, UNKNOWN_CURRENCY } = await import('../../dist/main/screening/pay.js');
  assert.equal(parsePay('Base pay 180,000 - 240,000 per year.', 'first-party').currency, UNKNOWN_CURRENCY);
  // The ones that do say stay exactly as they were.
  assert.equal(parsePay('Base pay $180,000 - $240,000.', 'first-party').currency, 'USD');
  assert.equal(parsePay('Range: £90,000 to £120,000.', 'first-party').currency, 'GBP');
});

test('a misread currency cannot clear a floor it does not clear', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  // 220,000 Canadian is well under a 170,000 dollar floor, and the arithmetic that
  // says otherwise is right about the numbers and wrong about the money.
  const html = '<p>The range is $155,000—$220,000 CAD per year.</p>';
  const said = await screen(lead({ html }), context());
  assert.equal(find(said, 'pay-floor').outcome, 'unknown');
  assert.match(find(said, 'pay-floor').because, /CAD/);
  assert.equal(said.clears, true, 'unknown is not a failure — it is a refusal to compare');
});

// --- what a lead is worth once it is read ---------------------------------

test('the posting says where the work is, and the reading comes with it', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  const hybrid = await screen(lead({ html: '<p>Hybrid, two days per week in the office.</p>' }), context());
  assert.equal(hybrid.remote, 'hybrid');
  const remote = await screen(lead({ html: '<p>This is a fully remote role.</p>' }), context());
  assert.equal(remote.remote, 'remote');
  const quiet = await screen(lead({ html: '<p>An ordinary posting.</p>' }), context());
  assert.equal(quiet.remote, 'unstated', 'silence is not a claim');
});

// --- one rule for a duplicate ---------------------------------------------

test('a re-listed posting on a new link is still the same posting', async () => {
  const { screen, pairKey } = await import('../../dist/main/screening/checks.js');
  const known = new Set([pairKey('Quarry Data, Inc.', 'Platform Engineer')]);
  const said = await screen(lead({ url: 'https://example.test/2' }), context({ knownPairs: known }));
  assert.equal(find(said, 'already-known').outcome, 'fail');
  assert.match(find(said, 'already-known').because, /different link/);
});

test('the employer half of the key collapses spellings, as the exclusion screen does', async () => {
  const { pairKey } = await import('../../dist/main/screening/checks.js');
  assert.equal(pairKey('Hollis Health', 'Staff SRE'), pairKey('Hollis Health, Inc.', 'Staff SRE'));
  assert.equal(pairKey('Stone & Rowe', 'Engineer'), pairKey('Stone and Rowe', 'Engineer'));
  assert.notEqual(pairKey('Hollis Health', 'Staff SRE'), pairKey('Hollis Labs', 'Staff SRE'));
});

// --- the three screens that were missing ----------------------------------

test('work that needs a nationality is reported against what the profile says', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  const html = '<p>This position is subject to ITAR and requires a U.S. person.</p>';
  const silent = await screen(lead({ html: '<p>Nothing of the sort.</p>' }), context());
  assert.equal(find(silent, 'restricted-work').outcome, 'pass');

  const said = await screen(lead({ html }), context());
  assert.equal(said.verdicts.find((v) => v.check === 'restricted-work').outcome, 'ask');
  assert.match(find(said, 'restricted-work').because, /does not say what yours is/);

  const told = await screen(lead({ html }), context({ profile: { workAuthorisation: 'US citizen' } }));
  assert.match(find(told, 'restricted-work').because, /US citizen/);
});

test('a posting with nowhere to apply says so rather than reading as ordinary', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  const fine = await screen(lead(), context());
  assert.equal(find(fine, 'route').outcome, 'pass');

  const noLink = await screen(lead({ url: null }), context());
  assert.equal(find(noLink, 'route').outcome, 'ask');
  assert.match(find(noLink, 'route').because, /Quarry Data/);

  const nobody = await screen(lead({ url: null, company: '' }), context());
  assert.match(find(nobody, 'route').because, /nowhere to apply and nowhere to look/);
});

test('the rung a title names is reported, never judged', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  const staff = await screen(lead({ role: 'Staff Platform Engineer' }), context());
  assert.equal(find(staff, 'title-tier').outcome, 'pass');
  assert.match(find(staff, 'title-tier').because, /staff/);

  const junior = await screen(lead({ role: 'Junior Platform Engineer' }), context());
  assert.equal(find(junior, 'title-tier').outcome, 'ask');

  const bare = await screen(lead({ role: 'Platform Engineer' }), context());
  assert.equal(find(bare, 'title-tier').outcome, 'ask');
  assert.match(find(bare, 'title-tier').because, /names no rung/);
});

test('a company that places people at other companies is named as one', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  const said = await screen(lead({ company: 'Northwind Staffing' }), context());
  assert.equal(find(said, 'named-employer').outcome, 'ask');
  assert.match(find(said, 'named-employer').because, /places people at other companies/);
});

test('the clearance sentence says what it means', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  const html = '<p>An active security clearance is required.</p>';
  const said = await screen(lead({ html }), context());
  // It used to read "a clearance you already hold", which is the opposite of the test.
  assert.match(find(said, 'clearance').because, /must already hold/);
});
