import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPack, adapterFor as compile, PackRejected } from '../../dist/main/sources/pack.js';
import { useSourcePacks, adapters, sourceProblems } from '../../dist/main/sources/index.js';

const pack = (source) => readPack('test.json', JSON.stringify({ sources: [source] }))[0];

const FEED = {
  id: 'example-feed',
  label: 'Example Feed',
  kind: 'aggregator',
  docs: 'https://example.test/api',
  endpoint: 'https://example.test/api/jobs?q={query}',
  list: 'results.jobs',
  fields: {
    company: 'employer.name',
    role: 'title',
    url: 'link',
    description: 'body',
    location: 'place.label',
    postedAt: 'posted',
    payMin: 'pay.low',
    payMax: 'pay.high',
    payDisclosure: 'pay.from',
  },
};

const body = (job) => JSON.stringify({ results: { jobs: [job] } });

test('a field map reads a feed nobody wrote code for', () => {
  const [lead] = compile(pack(FEED)).parse(body({
    employer: { name: 'Quarry Data' },
    title: 'Platform Engineer',
    link: 'https://example.test/1',
    body: 'Work here.',
    place: { label: 'Remote' },
    posted: '2026-09-02T00:00:00Z',
    pay: { low: 150000, high: 180000, from: 'posted' },
  }));
  assert.equal(lead.company, 'Quarry Data', 'a dotted path did not reach the field');
  assert.equal(lead.role, 'Platform Engineer');
  assert.equal(lead.location, 'Remote');
  assert.deepEqual([lead.statedPay.min, lead.statedPay.max], [150000, 180000]);
  assert.equal(lead.statedPay.provenance, 'aggregated');
});

test('a figure the listing site worked out itself is not a band', () => {
  // These have been out by tens of thousands at the ceiling, which is the end that
  // decides whether a role is worth reading at all.
  for (const from of ['inferred', 'estimate', 'ESTIMATED']) {
    const [lead] = compile(pack(FEED)).parse(body({
      employer: { name: 'Quarry Data' }, title: 'Platform Engineer',
      pay: { low: 150000, high: 180000, from },
    }));
    assert.equal(lead.statedPay, null, `${from} was read as a band`);
  }
});

test('a feed that never says where a figure came from has its pay ignored', () => {
  // A missing disclosure field used to read as "the employer posted it", so two feeds
  // had their own estimates labelled as bands. Pay is a hard screen, so that drops roles.
  const silent = { ...FEED, fields: { ...FEED.fields } };
  delete silent.fields.payDisclosure;
  const [lead] = compile(pack(silent)).parse(body({
    employer: { name: 'Quarry Data' }, title: 'Platform Engineer',
    pay: { low: 150000, high: 180000 },
  }));
  assert.equal(lead.statedPay, null, 'a feed with no disclosure field had its pay read');
});

test('a feed that does say so is read, by flag or by word', () => {
  // The other direction, because a rule that only ever refuses is not a rule.
  for (const from of ['posted', 'employer', true]) {
    const [lead] = compile(pack(FEED)).parse(body({
      employer: { name: 'Quarry Data' }, title: 'Platform Engineer',
      pay: { low: 150000, high: 180000, from },
    }));
    assert.equal(lead.statedPay?.max, 180000, `${String(from)} was not read as a band`);
  }
  for (const from of [false, null, undefined]) {
    const [lead] = compile(pack(FEED)).parse(body({
      employer: { name: 'Quarry Data' }, title: 'Platform Engineer',
      pay: { low: 150000, high: 180000, from },
    }));
    assert.equal(lead.statedPay, null, `${String(from)} was read as a band`);
  }
});

test('no shipped feed offers a figure it cannot attribute', () => {
  // The trap is easy to walk back into: the pay fields are the obvious thing to map
  // and the disclosure field is the one nobody thinks of.
  const shipped = readPack('sources.json', readFileSync('defaults/sources.json', 'utf8'));
  for (const source of shipped) {
    const offersPay = source.fields.payMin !== undefined || source.fields.payMax !== undefined;
    if (offersPay) {
      assert.notEqual(source.fields.payDisclosure, undefined,
        `${source.id} maps pay fields with nothing saying who published the figure`);
    }
  }
});

test('a missing field is absent rather than invented', () => {
  const [lead] = compile(pack(FEED)).parse(body({ title: 'Platform Engineer' }));
  assert.equal(lead.company, 'Unnamed company');
  assert.equal(lead.url, null);
  assert.equal(lead.postedAt, null, 'no date must not become today, or every stale posting looks fresh');
  assert.equal(lead.statedPay, null);
});

test('a search term is a query and cannot escape the address it was given', () => {
  const url = new URL(compile(pack(FEED)).endpoint('site reliability engineer'));
  assert.equal(url.host, 'example.test');
  assert.equal(url.searchParams.get('q'), 'site reliability engineer');
  assert.equal(new URL(compile(pack(FEED)).endpoint('../../evil?x=')).host, 'example.test');
});

test('a pack that would fetch over plain http is refused', () => {
  assert.throws(() => pack({ ...FEED, endpoint: 'http://example.test/api?q={query}' }), PackRejected);
});

test('a pack with no place to put the search term has to say so', () => {
  // Otherwise it fetches the same page once per title: several requests for one
  // answer, in an app whose whole claim is that it counts what it sends.
  assert.throws(() => pack({ ...FEED, endpoint: 'https://example.test/api' }), PackRejected);
  const searchless = pack({ ...FEED, endpoint: 'https://example.test/api', searchless: true });
  assert.equal(compile(searchless).searchless, true);
});

test('a pack must say where the company and the role are', () => {
  assert.throws(() => pack({ ...FEED, fields: { role: 'title' } }), PackRejected);
  assert.throws(() => pack({ ...FEED, fields: { company: 'employer.name' } }), PackRejected);
});

test('a pack cannot claim an employer board\'s standing for a republished figure', () => {
  // provenance is not the file's to choose: it is what decides whether a figure is
  // allowed to rank, and every screen downstream trusts it.
  const claimed = pack({ ...FEED, kind: 'aggregator', provenance: 'first-party' });
  assert.equal(claimed.provenance, 'aggregated');
});

test('a pack cannot switch a feed on', () => {
  // Importing a file must never cause a request. Whether Cairn fetches from somewhere
  // is a row in the vault that a person set.
  const eager = pack({ ...FEED, enabled: true });
  assert.equal('enabled' in eager, false);
});

const from = (definition, origin, shipped) => ({ definition, origin, shipped });

test('a pack cannot take over a feed Cairn already reads', () => {
  // Re-pointing `greenhouse` would send every employer board somebody added to a host
  // of the file's choosing, with nothing on screen to say so.
  useSourcePacks([from(pack({ ...FEED, id: 'greenhouse' }), 'mine.json', false)], []);
  assert.equal(adapters().filter((a) => a.id === 'greenhouse').length, 1);
  assert.equal(adapters().find((a) => a.id === 'greenhouse').kind, 'ats');
  assert.ok(sourceProblems().some((one) => one.includes('greenhouse')), 'the refusal was silent');
});

test('your version of a shipped feed replaces it, quietly', () => {
  // This is what makes a shipped feed editable without touching the app: yours is
  // written beside it, not over it, and removing yours brings the original back.
  useSourcePacks([
    from(pack({ ...FEED, endpoint: 'https://shipped.test/api?q={query}' }), 'sources.json', true),
    from(pack({ ...FEED, endpoint: 'https://mine.test/api?q={query}' }), 'your-feeds.json', false),
  ], []);
  const feed = adapters().find((a) => a.id === FEED.id);
  assert.equal(new URL(feed.endpoint('x')).host, 'mine.test');
  assert.deepEqual(sourceProblems(), [], 'replacing a sample is the point, not a complaint');
});

test('two of your own files claiming one feed is said out loud', () => {
  // Nothing on the screen would otherwise show which of the two is running.
  useSourcePacks([
    from(pack(FEED), 'one.json', false),
    from(pack(FEED), 'two.json', false),
  ], []);
  assert.equal(adapters().filter((a) => a.id === FEED.id).length, 1);
  assert.ok(sourceProblems().some((one) => one.includes('one.json') && one.includes('two.json')));
});

test('a broken pack is refused by name rather than half-read', () => {
  assert.throws(() => readPack('mine.json', 'not json'), (error) => {
    assert.match(error.message, /mine\.json/);
    return true;
  });
  assert.throws(() => readPack('mine.json', '{}'), PackRejected);
  assert.throws(() => pack({ ...FEED, id: 'Not An Id' }), PackRejected);
});

test('the pack that ships describes every feed it carries', () => {
  const shipped = readPack('sources.json', readFileSync('defaults/sources.json', 'utf8'));
  assert.ok(shipped.length >= 4, 'the shipped pack is where a first run gets its feeds');
  for (const source of shipped) {
    assert.ok(source.note.length > 0, `${source.id} says nothing about what it is good for`);
    assert.match(source.docs, /^https:\/\//, `${source.id} does not say where it is documented`);
  }
  // Left as it was found: the tests above swapped the registry out.
  useSourcePacks(shipped.map((definition) => ({ definition, origin: 'sources.json', shipped: true })), []);
});
