import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { greenhouse, lever, ashby, smartrecruiters, smartrecruitersDetail } from '../../dist/main/sources/ats.js';
import { boardFromUrl, adapterFor, adapters, useSourcePacks } from '../../dist/main/sources/index.js';
import { readPack } from '../../dist/main/sources/pack.js';
import { SourceShapeChanged } from '../../dist/main/sources/types.js';
import { toText } from '../../dist/main/screening/text.js';
import { parsePay } from '../../dist/main/screening/pay.js';

// The feeds are not code any more: what a listing site is arrives from the shipped
// pack, exactly as it does when the app starts.
const entries = (body, origin = 'sources.json', shipped = true) =>
  readPack(origin, body).map((definition) => ({ definition, origin, shipped }));
useSourcePacks(entries(readFileSync('defaults/sources.json', 'utf8')), []);
const remotive = adapterFor('remotive');
const arbeitnow = adapterFor('arbeitnow');

test('greenhouse: a doubly-escaped description still gives up its range', () => {
  // This is the failure the whole text layer exists for, tested end to end from the
  // shape a board actually returns.
  const body = JSON.stringify({
    meta: { company_name: 'Northwind Systems' },
    jobs: [{
      title: 'Platform Engineer',
      absolute_url: 'https://boards.greenhouse.io/northwind/jobs/1',
      content: '&lt;p&gt;Base pay is $150,000 &amp;mdash; $180,000.&lt;/p&gt;',
      location: { name: 'Remote' },
      updated_at: '2026-09-01T00:00:00Z',
    }],
  });
  const [lead] = greenhouse.parse(body, 'northwind');
  assert.equal(lead.company, 'Northwind Systems');
  const pay = parsePay(toText(lead.html), 'first-party');
  assert.deepEqual([pay.min, pay.max], [150000, 180000]);
});

test('lever: a structured range is marked as the employer\'s own', () => {
  const body = JSON.stringify([{
    text: 'Site Reliability Engineer',
    hostedUrl: 'https://jobs.lever.co/halcyon/abc',
    descriptionPlain: 'You will keep things running.',
    categories: { team: 'Halcyon Labs', location: 'Remote' },
    salaryRange: { min: 150000, max: 190000, currency: 'USD' },
    createdAt: 1757000000000,
  }]);
  const [lead] = lever.parse(body, 'halcyon');
  assert.equal(lead.statedPay.provenance, 'first-party');
  assert.deepEqual([lead.statedPay.min, lead.statedPay.max], [150000, 190000]);
  assert.match(lead.postedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('ashby: the compensation summary joins the text the range parser reads', () => {
  const body = JSON.stringify({
    organizationName: 'Tessellate',
    jobs: [{
      title: 'Infrastructure Engineer',
      jobUrl: 'https://jobs.ashbyhq.com/tessellate/x',
      descriptionHtml: '<p>Own the platform.</p>',
      location: 'Remote',
      publishedAt: '2026-09-03T00:00:00Z',
      compensation: { scrapeableCompensationSalarySummary: '$160,000 - $200,000' },
    }],
  });
  const [lead] = ashby.parse(body, 'tessellate');
  const pay = parsePay(toText(lead.html), 'first-party');
  assert.deepEqual([pay.min, pay.max], [160000, 200000]);
});

test('smartrecruiters: a list row carries no description, so it is fetched', () => {
  const list = JSON.stringify({
    content: [{
      name: 'Backend Engineer',
      ref: 'https://api.smartrecruiters.com/v1/companies/bramblewick/postings/9',
      company: { name: 'Bramblewick' },
      location: { city: 'Lisbon', country: 'pt' },
      releasedDate: '2026-08-30T00:00:00Z',
    }],
  });
  const [row] = smartrecruiters.parse(list, 'bramblewick');
  assert.equal(row.html, '', 'a list row must not pretend to have a description');
  assert.equal(smartrecruiters.detailEndpoint(row), row.url);

  const detail = JSON.stringify({
    jobAd: { sections: { jobDescription: { text: 'Base pay $130,000 to $155,000.' } } },
  });
  const filled = smartrecruitersDetail(detail, row);
  assert.match(filled.html, /130,000/);
});

test('a detail response with no sections is refused, not accepted as empty', () => {
  // An empty description would pass every screen, which looks like a working source
  // and is a source that decides nothing.
  assert.throws(() => smartrecruitersDetail(JSON.stringify({ jobAd: { sections: {} } }), { html: '' }),
    SourceShapeChanged);
});

test('the shipped pack gives back the feeds it describes', () => {
  for (const id of ['remotive', 'arbeitnow', 'jobicy', 'remoteok']) {
    assert.ok(adapterFor(id) !== null, `${id} is in defaults/sources.json and did not load`);
  }
});

test('aggregators never claim to be first-party', () => {
  const remotiveBody = JSON.stringify({
    jobs: [{ company_name: 'Quarry Data', title: 'Platform Engineer',
             url: 'https://remotive.com/x', description: 'Work.', salary: '$120k - $150k',
             publication_date: '2026-09-02T00:00:00Z', candidate_required_location: 'Anywhere' }],
  });
  const [lead] = remotive.parse(remotiveBody, 'platform');
  assert.equal(lead.statedPay, null, 'a listing site figure is prose, never a stated field');
  assert.equal(remotive.provenance, 'aggregated');
  assert.match(lead.html, /Salary: \$120k - \$150k/);

  const arbeitnowBody = JSON.stringify({
    data: [{ company_name: 'Fenwick Cloud', title: 'Staff Engineer',
             url: 'https://arbeitnow.com/x', description: 'Work.', remote: true, created_at: 1757000000 }],
  });
  const [second] = arbeitnow.parse(arbeitnowBody, '');
  assert.equal(second.location, 'Remote');
  assert.equal(second.postedAt, new Date(1757000000 * 1000).toISOString(), 'a unix stamp is a date');
  assert.equal(arbeitnow.provenance, 'aggregated');
});

test('a response that is not JSON names the source rather than throwing a bare syntax error', () => {
  assert.throws(() => greenhouse.parse('<html>Rate limited</html>', 'x'), (error) => {
    assert.ok(error instanceof SourceShapeChanged);
    assert.match(error.message, /greenhouse/);
    return true;
  });
});

test('an unexpected shape is refused rather than read as no openings', () => {
  // Returning [] here would report a healthy board with nothing on it, and stay wrong
  // for as long as nobody checked.
  assert.throws(() => greenhouse.parse(JSON.stringify({ jobs: 'none' }), 'x'), SourceShapeChanged);
  assert.throws(() => lever.parse(JSON.stringify({ not: 'a list' }), 'x'), SourceShapeChanged);
});

test('a board is read out of any link on it', () => {
  const cases = [
    ['https://boards.greenhouse.io/northwind/jobs/4012345', 'greenhouse', 'northwind'],
    ['https://job-boards.greenhouse.io/tessellate/jobs/9', 'greenhouse', 'tessellate'],
    ['https://jobs.lever.co/halcyon/4c2f-11ee', 'lever', 'halcyon'],
    ['https://jobs.ashbyhq.com/quarry-data/abc-123', 'ashby', 'quarry-data'],
    ['https://jobs.smartrecruiters.com/Bramblewick/74400', 'smartrecruiters', 'Bramblewick'],
  ];
  for (const [url, sourceId, token] of cases) {
    assert.deepEqual(boardFromUrl(url), { sourceId, token }, url);
  }
});

test('a link that is not a board gives nothing rather than a guess', () => {
  // A wrong token polls somebody else's board for ever and looks like it is working.
  for (const url of [
    'https://example.test/careers',
    'https://jobs.lever.co/search?q=platform',
    'not a url at all',
    'ftp://boards.greenhouse.io/northwind',
  ]) {
    assert.equal(boardFromUrl(url), null, url);
  }
});

test('every adapter is reachable by its own id', () => {
  for (const adapter of adapters()) {
    assert.equal(adapterFor(adapter.id), adapter);
  }
  assert.equal(adapterFor('nothing-called-this'), null);
});

test('every adapter builds an https endpoint', () => {
  for (const adapter of adapters()) {
    const url = new URL(adapter.endpoint('northwind'));
    assert.equal(url.protocol, 'https:', adapter.id);
  }
});

test('a board name that could climb the path is refused, not escaped', () => {
  // Escaping turns ../ into %2F..%2F, which is harmless here and is a separator to a
  // server that decodes before it routes. Refusing the shape has no such argument.
  for (const adapter of adapters().filter((a) => a.kind === 'ats')) {
    for (const bad of ['a token/../with junk', '../../etc', 'has space', '', 'x'.repeat(200)]) {
      assert.throws(() => adapter.endpoint(bad), SourceShapeChanged, `${adapter.id} accepted "${bad}"`);
    }
  }
});

test('a search term may still be anything, because it is a query and not a path', () => {
  const url = new URL(remotive.endpoint('site reliability engineer'));
  assert.equal(url.searchParams.get('search'), 'site reliability engineer');
});
