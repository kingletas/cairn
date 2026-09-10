import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { bandOf, isNarrowed, narrow, settled, skillsNamed, WHOLE_LIST } =
  await import('../../dist/shared/band.js');
const { screen } = await import('../../dist/main/screening/checks.js');

const RULES = { payFloor: 150000, payTarget: 170000, currency: 'USD' };
const pay = (min, max, currency = 'USD') => ({
  min, max, currency, period: 'year', provenance: 'first-party', evidence: null,
});

test('a band is read off the top of the range', () => {
  // The top is what a role is worth. Reading the bottom would drop everything whose
  // range starts low, which is most of them.
  assert.equal(bandOf(pay(120000, 240000), RULES), 'clears');
  assert.equal(bandOf(pay(150000, 168000), RULES), 'under');
  assert.equal(bandOf(pay(90000, 140000), RULES), 'below');
  assert.equal(bandOf(pay(null, 170000), RULES), 'clears', 'exactly on target clears it');
  assert.equal(bandOf(pay(200000, null), RULES), 'clears', 'a single figure is the top');
});

test('nothing to compare is said, never guessed at', () => {
  assert.equal(bandOf(null, RULES), 'unstated');
  assert.equal(bandOf(pay(200000, 240000, 'GBP'), RULES), 'uncompared', 'another currency is not a comparison');
  assert.equal(bandOf(pay(200000, 240000), { ...RULES, payFloor: null }), 'uncompared');
  assert.equal(bandOf(pay(160000, 160000), { ...RULES, payTarget: null }), 'clears',
    'with no target the floor is the target');
});

test('the filter and the gate read one role the same way', async () => {
  // Two arithmetics for one question eventually disagree, and the screen that disagrees
  // with the gate is the one nobody trusts afterwards.
  const profile = {
    displayName: 'T', locations: [], remoteOnly: false, currency: 'USD',
    payFloor: 150000, payTarget: 170000, skills: [], families: ['infrastructure'],
    workAuthorisation: null, needsSponsorship: null,
  };
  const context = {
    profile,
    settings: {
      maxPostingAgeDays: 30, requireFirstPartyPay: false, excludedEmployers: [],
      harvestCadenceHours: null, requestDelayMs: 0, sequentialFetch: true,
      identifyAs: 'cairn', keepDroppedHashes: true, theme: 'system', accent: 'pine',
      density: 'comfortable', textSize: 'default', weekStartsOn: 'monday',
      lockAfterMinutes: null, chaseAfterDays: 10, lastHarvest: null,
    },
    titles: ['Engineer'], knownUrls: new Set(), knownPairs: new Set(), droppedHashes: new Set(), now: new Date(),
  };
  for (const [min, max, band] of [[200000, 240000, 'clears'], [150000, 168000, 'under'], [90000, 140000, 'below']]) {
    const result = await screen({
      company: 'Northwind', role: 'Engineer', url: 'https://example.test/1',
      html: '<p>An ordinary posting.</p>', postedAt: new Date().toISOString(),
      statedPay: pay(min, max), firstParty: true,
    }, context);
    const floor = result.verdicts.find((one) => one.check === 'pay-floor');
    assert.equal(bandOf(pay(min, max), profile), band);
    assert.equal(floor.outcome, band === 'below' ? 'fail' : 'pass',
      `the gate and the ${band} band disagree about the same range`);
  }
});

test('a skill is named or it is not', () => {
  const mine = ['PHP', 'Kubernetes'];
  assert.deepEqual(skillsNamed('We run php and Go.', mine), ['PHP'], 'case is not part of a skill');
  assert.deepEqual(skillsNamed('PHP and Kubernetes.', mine), ['PHP', 'Kubernetes'], 'kept in the order you listed');
  assert.deepEqual(skillsNamed('Nothing of yours.', mine), []);
  assert.deepEqual(skillsNamed(null, mine), [], 'a role added by hand has no posting to read');
  assert.deepEqual(skillsNamed('PHP', ['', '  ']), [], 'a blank skill matches everything, so it matches nothing');
});

const ROLES = [
  { pay: pay(210000, 240000), posting: 'PHP and Kubernetes at scale.' },
  { pay: pay(150000, 168000), posting: 'Magento and PHP, day to day.' },
  { pay: pay(120000, 140000), posting: 'Kubernetes and Go.' },
  { pay: null, posting: 'No figures. Some PHP.' },
  { pay: pay(200000, 230000), posting: 'None of yours appear here.' },
];
const MINE = ['PHP', 'Magento', 'Kubernetes'];

test('narrowing by pay, by skill, and by both', () => {
  const only = (n) => narrow(ROLES, n, RULES, MINE, (one) => one).length;
  assert.equal(only(WHOLE_LIST), 5, 'the whole list is the default');
  assert.equal(only({ band: 'clears', skill: 'any' }), 2);
  assert.equal(only({ band: 'below', skill: 'any' }), 1);
  assert.equal(only({ band: 'unstated', skill: 'any' }), 1);
  assert.equal(only({ band: 'any', skill: 'PHP' }), 3);
  assert.equal(only({ band: 'any', skill: 'none' }), 1, 'the one naming none of yours');
  assert.equal(only({ band: 'clears', skill: 'Kubernetes' }), 1, 'both at once, not either');
});

test('a skill of your own wins over the words the control uses', () => {
  // Somebody whose skill is called "none" still gets to filter by it.
  const mine = ['none', 'any'];
  const rows = [{ pay: null, posting: 'we use none here' }, { pay: null, posting: 'nothing of yours' }];
  assert.equal(narrow(rows, { band: 'any', skill: 'none' }, RULES, mine, (one) => one).length, 1);
});

test('a narrowing that can no longer decide anything reads as off', () => {
  // A skill taken off your profile, or a pay floor cleared, leaves a control saying it is
  // set while it changes nothing — and then a full list looks like a broken filter.
  assert.deepEqual(settled({ band: 'clears', skill: 'Rust' }, RULES, MINE), { band: 'clears', skill: 'any' });
  assert.deepEqual(settled({ band: 'clears', skill: 'PHP' }, { ...RULES, payFloor: null }, MINE),
    { band: 'any', skill: 'PHP' });
  assert.deepEqual(settled({ band: 'any', skill: 'none' }, RULES, []), { band: 'any', skill: 'any' },
    'with no skills listed, none of them is every role');
  assert.equal(isNarrowed(settled({ band: 'clears', skill: 'Rust' }, { ...RULES, payFloor: null }, MINE)), false);
  assert.equal(narrow(ROLES, { band: 'clears', skill: 'Rust' }, { ...RULES, payFloor: null }, MINE, (one) => one).length, 5);
});

test('a list is narrowed before its tabs are counted', () => {
  // Counted first, a tab reads "All 47" above twelve rows — the same two numbers for one
  // thing the tab counts were introduced to fix.
  for (const file of [
    'src/renderer/views/applications.ts', 'src/renderer/views/pipeline.ts',
    'src/renderer/views/requisitions.ts',
  ]) {
    const body = readFileSync(file, 'utf8');
    const narrowed = body.indexOf('narrow(all');
    const counted = body.indexOf('sections({');
    assert.ok(narrowed > 0, `${file} never narrows`);
    assert.ok(counted > narrowed, `${file} counts its tabs before it narrows`);
  }
});

test('the controls stay on screen when they have hidden everything', () => {
  // Gone, there is no way back to the full list except reloading the app.
  for (const file of [
    'src/renderer/views/applications.ts', 'src/renderer/views/pipeline.ts',
    'src/renderer/views/requisitions.ts',
  ]) {
    const body = readFileSync(file, 'utf8');
    const empty = /length === 0\) \{\s*\n?\s*body\.append\((bar, )?el\('p', \{ class: 'lede' \}/.exec(body);
    assert.ok(body.includes('matches this. Show everything to see them all.'),
      `${file} says nothing when a narrowing hides every row`);
    assert.ok(empty !== null || body.includes('body.append(bar,'), `${file} drops the controls when nothing matches`);
  }
});

test('a list a narrowing emptied does not claim you have nothing', () => {
  // "Nothing waiting — turn on a source and fetch" is true of an empty queue and false
  // of one a filter has hidden, and the second reads as the fetch having failed.
  const leads = readFileSync('src/renderer/views/requisitions.ts', 'utf8');
  assert.match(leads, /requisitions\.length === 0 && lens/, 'the waiting half tells the two apart');
  assert.match(leads, /lens\s*\n?\s*\? el\('p', \{ class: 'lede' \}, 'Nothing you set aside matches this\.'\)/,
    'the set-aside half tells the two apart');
});

test('a lead is read as text, the way the gate read it', () => {
  // The posting arrives as HTML. Matched raw, a skill hides inside a tag and a class
  // name counts as a mention — so the filter and the gate would part on the same lead.
  const leads = readFileSync('src/renderer/views/requisitions.ts', 'utf8');
  assert.match(leads, /posting: toText\(requisition\.raw\)/);
  assert.match(readFileSync('src/main/ipc/handlers.ts', 'utf8'), /posting: toText\(requisition\.raw\)/,
    'a kept lead stores the same text, so the two screens agree after it is kept');
});
