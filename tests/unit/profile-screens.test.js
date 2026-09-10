import { test } from 'node:test';
import assert from 'node:assert/strict';

/** Setup asks five things about you that no screen read for the life of the app: where
 *  you are, whether you will only work remotely, which currency your figures are in,
 *  and the two eligibility answers. A question somebody answers and nothing compares
 *  anything to is worse than not asking, because it reads as a promise. */
const settings = {
  maxPostingAgeDays: 30, requireFirstPartyPay: false, excludedEmployers: [],
  harvestCadenceHours: null, requestDelayMs: 0, sequentialFetch: false,
  identifyAs: 'cairn', keepDroppedHashes: true, theme: 'system', accent: 'pine',
  density: 'comfortable', textSize: 'default', weekStartsOn: 'monday',
  lockAfterMinutes: null, chaseAfterDays: 10, lastHarvest: null,
};

const profile = (over) => ({
  displayName: 'T', locations: [], remoteOnly: false, currency: 'USD',
  payFloor: 150000, payTarget: null, skills: [], families: ['infrastructure'],
  workAuthorisation: null, needsSponsorship: null, ...over,
});

const context = (over) => ({
  profile: profile(over?.profile), settings: { ...settings, ...over?.settings },
  titles: ['Platform Engineer'], knownUrls: new Set(), knownPairs: new Set(), droppedHashes: new Set(), now: new Date(),
});

const lead = (over) => ({
  company: 'Quarry Data', role: 'Platform Engineer', url: 'https://example.test/1',
  html: '<p>An ordinary posting.</p>', postedAt: new Date().toISOString(),
  statedPay: null, firstParty: true, ...over,
});

const find = (result, check) => result.verdicts.find((v) => v.check === check);

test('remote only is read, and says so when a posting asks you to be somewhere', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  const html = '<p>This role is hybrid, two days per week in the office.</p>';
  const said = await screen(lead({ html }), context({ profile: { remoteOnly: true } }));
  assert.equal(find(said, 'location-clause').outcome, 'ask');
  assert.match(find(said, 'location-clause').because, /remote only/i);

  // And it does not say it to somebody who never asked for remote only.
  const quiet = await screen(lead({ html }), context());
  assert.doesNotMatch(find(quiet, 'location-clause').because, /remote only/i);
});

test('a place you named is recognised, and its absence is said plainly', async () => {
  const { screen } = await import('../../dist/main/screening/checks.js');
  const mine = await screen(
    lead({ html: '<p>Hybrid, two days per week in the office in Bristol.</p>' }),
    context({ profile: { locations: ['Bristol'] } }));
  assert.match(find(mine, 'location-clause').because, /Bristol/);

  const elsewhere = await screen(
    lead({ html: '<p>Hybrid, two days per week in the office in Munich.</p>' }),
    context({ profile: { locations: ['Bristol'] } }));
  assert.match(find(elsewhere, 'location-clause').because, /does not name anywhere you said you are/);
});

test('a range in another currency is not compared to your floor', async () => {
  // Pay is one of the screens that drops a lead outright, so comparing 120,000 of one
  // currency against a floor in another is not a wrong label -- it is a real role
  // removed by arithmetic nobody can see.
  const { screen } = await import('../../dist/main/screening/checks.js');
  const foreign = {
    min: 90000, max: 120000, currency: 'GBP', period: 'year',
    provenance: 'first-party', evidence: 'Stated by the employer.',
  };
  const said = await screen(lead({ statedPay: foreign }), context());
  assert.equal(find(said, 'pay-floor').outcome, 'unknown', 'it compared two different currencies');
  assert.match(find(said, 'pay-floor').because, /GBP.*USD|USD.*GBP/);
  assert.equal(said.clears, true, 'a role was dropped for being priced in another currency');

  // The same figures in your own currency are compared as before.
  const home = await screen(lead({ statedPay: { ...foreign, currency: 'USD' } }), context());
  assert.equal(find(home, 'pay-floor').outcome, 'fail');
});
