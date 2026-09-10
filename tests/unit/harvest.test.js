import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Store } from '../../dist/main/db/store.js';
import { Repo } from '../../dist/main/repo.js';
import { harvest } from '../../dist/main/harvest.js';
import { MIGRATIONS } from '../../dist/main/db/schema.js';
import { readFileSync } from 'node:fs';
import { readPack } from '../../dist/main/sources/pack.js';
import { useSourcePacks } from '../../dist/main/sources/index.js';

// The listing sites are not code: they arrive from the shipped pack, the way they do
// when the app starts.
useSourcePacks(
  readPack('sources.json', readFileSync('defaults/sources.json', 'utf8'))
    .map((definition) => ({ definition, origin: 'sources.json', shipped: true })),
  [],
);

const require = createRequire(import.meta.url);
const keyring = require('../../native/' + readdirSync('native').find((n) => n.endsWith('.node')));

/** A real vault, a real screening pass, real writes -- only the network is replaced.
 *  Testing the pieces separately would never have caught a run that fetches, screens
 *  and then writes nothing. */
async function withVault(run) {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-test-'));
  const store = new Store(join(dir, 'vault.db'));
  const salt = keyring.newSalt();
  store.writeHeader(salt);
  store.open(keyring.unlock('a passphrase for one test', salt));
  store.run('INSERT INTO profile (id, display_name, families, skills, pay_floor, currency) VALUES (1,?,?,?,?,?)',
    ['Tester', JSON.stringify(['infrastructure']), JSON.stringify(['Kubernetes']), 140000, 'USD']);
  try {
    // Awaited, not returned. Returning the promise lets `finally` close the vault
    // while the run is still using it, and every assertion afterwards reads an
    // empty database that looks like a run which did nothing.
    return await run(new Repo(store), store);
  } finally {
    store.close();
    keyring.lock();
    rmSync(dir, { recursive: true, force: true });
  }
}

const boardBody = (pay) => JSON.stringify({
  meta: { company_name: 'Northwind Systems' },
  jobs: [{
    title: 'Platform Engineer',
    absolute_url: 'https://boards.greenhouse.io/northwind/jobs/1',
    content: `&lt;p&gt;You will run Kubernetes. Base pay is ${pay}.&lt;/p&gt;`,
    location: { name: 'Remote' },
    updated_at: new Date().toISOString(),
  }],
});

function stubFetch(body, { ok = true, status = 200 } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return { ok, status, text: async () => body };
  };
  return calls;
}

const target = { sourceId: 'greenhouse', token: 'northwind', company: 'Northwind Systems' };

const TITLES = ['Platform Engineer', 'Site Reliability Engineer', 'Infrastructure Engineer'];

function context(repo, titles = TITLES) {
  return {
    profile: repo.profile(), settings: repo.settings(), titles,
    knownUrls: repo.knownUrls(), knownPairs: repo.knownPairs(), droppedHashes: repo.droppedHashes(), now: new Date(),
  };
}

function gate(repo) {
  return { identifyAs: 'cairn', delayMs: 0, timeoutMs: 5000, onRecord: (r) => repo.recordOutbound(r) };
}

test('a run fetches, screens, and writes what survives', async () => {
  await withVault(async (repo) => {
    stubFetch(boardBody('$150,000 - $180,000'));
    const result = await harvest(repo, [target], context(repo), gate(repo));
    assert.equal(result.outcomes[0].found, 1);
    assert.equal(result.outcomes[0].kept, 1);
    assert.equal(repo.requisitions().length, 1);
    const [saved] = repo.requisitions();
    assert.equal(saved.company, 'Northwind Systems');
    assert.ok(saved.screening.verdicts.some((v) => v.check === 'pay-floor' && v.outcome === 'pass'));
  });
});

test('a role under the floor is screened out before it reaches a person', async () => {
  await withVault(async (repo) => {
    stubFetch(boardBody('$80,000 - $95,000'));
    const result = await harvest(repo, [target], context(repo), gate(repo));
    assert.equal(result.outcomes[0].found, 1);
    assert.equal(result.outcomes[0].kept, 0);
    assert.equal(repo.requisitions().length, 0);
  });
});

test('every request is counted, whether it worked or not', async () => {
  await withVault(async (repo) => {
    stubFetch(boardBody('$150,000 - $180,000'));
    await harvest(repo, [target], context(repo), gate(repo));
    assert.equal(repo.outboundToday(), 1);
    const [record] = repo.recentOutbound();
    assert.equal(record.host, 'boards-api.greenhouse.io');
    assert.match(record.reason, /Northwind Systems/);
  });
});

test('a source that fails is reported, never mistaken for one with nothing new', async () => {
  await withVault(async (repo) => {
    stubFetch('', { ok: false, status: 503 });
    const result = await harvest(repo, [target], context(repo), gate(repo));
    assert.match(result.outcomes[0].error, /503/);
    assert.equal(repo.outboundToday(), 1, 'a failed request still leaves a record');
  });
});

test('a changed response shape is reported rather than read as an empty board', async () => {
  await withVault(async (repo) => {
    stubFetch('<html>Rate limited</html>');
    const result = await harvest(repo, [target], context(repo), gate(repo));
    assert.match(result.outcomes[0].error, /greenhouse/);
    assert.equal(result.outcomes[0].kept, 0);
  });
});

test('one bad board does not stop the run', async () => {
  await withVault(async (repo) => {
    let call = 0;
    globalThis.fetch = async () => {
      call += 1;
      return call === 1
        ? { ok: false, status: 500, text: async () => '' }
        : { ok: true, status: 200, text: async () => boardBody('$150,000 - $180,000') };
    };
    const second = { sourceId: 'greenhouse', token: 'tessellate', company: 'Tessellate' };
    const result = await harvest(repo, [target, second], context(repo), gate(repo));
    assert.equal(result.outcomes.length, 2);
    assert.notEqual(result.outcomes[0].error, null);
    assert.equal(result.outcomes[1].error, null);
    assert.equal(result.requisitions, 1);
  });
});

test('a posting already in the pipeline is not offered again', async () => {
  await withVault(async (repo) => {
    repo.saveOpportunity({
      id: 'existing', company: 'Northwind Systems', role: 'Platform Engineer',
      url: 'https://boards.greenhouse.io/northwind/jobs/1', location: null, remote: 'remote',
      pay: null, stage: 'applied', fit: null, family: null, nextAction: null,
      nextActionDue: null, postedAt: null, capturedAt: new Date().toISOString(),
      archivedAt: null, notes: null,
    });
    stubFetch(boardBody('$150,000 - $180,000'));
    const result = await harvest(repo, [target], context(repo), gate(repo));
    assert.equal(result.outcomes[0].kept, 0);
  });
});

test('every migration runs, in order, exactly once', () => {
  // Read from the migration list rather than a copy of it, so adding one does not
  // mean editing this. A copy would need updating every time and would eventually
  // be updated without anybody checking what it now asserts.
  return withVault(async (repo, store) => {
    const applied = store.all('SELECT id FROM migration ORDER BY id').map((r) => r.id);
    assert.deepEqual(applied, MIGRATIONS.map((m) => m.id));
    assert.deepEqual(applied, [...applied].sort((a, b) => a - b), 'migrations ran out of order');
    assert.equal(new Set(applied).size, applied.length, 'a migration ran twice');
  });
});

test('the columns later migrations add are there', () => {
  return withVault(async (repo, store) => {
    const columns = (table) => store.all(`PRAGMA table_info(${table})`).map((c) => c.name);
    assert.ok(columns('requisition').includes('pay'));
    assert.ok(columns('answer').includes('intent'));
    assert.ok(columns('opportunity').includes('applied_at'));
  });
});

test('a listing site actually gets fetched, not just planned', async () => {
  // The plan and the run used to disagree: the plan is new, and the run built its
  // targets from boards alone. A test that only checked the plan would have passed
  // while nothing was fetched.
  await withVault(async (repo) => {
    const body = JSON.stringify({
      jobs: [{
        company_name: 'Quarry Data', title: 'Platform Engineer',
        url: 'https://remotive.com/x', description: 'You will run Kubernetes. Base pay is $150,000 - $180,000.',
        publication_date: new Date().toISOString(), candidate_required_location: 'Anywhere',
      }],
    });
    const calls = stubFetch(body);
    const result = await harvest(
      repo,
      [{ sourceId: 'remotive', token: 'platform engineer', company: 'platform engineer' }],
      context(repo), gate(repo),
    );
    assert.equal(calls.length, 1, 'nothing was fetched');
    assert.match(calls[0], /remotive\.com/);
    assert.match(calls[0], /search=platform\+engineer|search=platform%20engineer/);
    assert.equal(result.outcomes[0].found, 1);
    assert.equal(result.outcomes[0].kept, 1);
  });
});

test('one posting under several search terms is kept once', async () => {
  // A DevOps role answers a search for "Platform Engineer" and one for "Site
  // Reliability Engineer". The screens read the database as it was when the run
  // started, so without a within-run check it is kept once per term.
  await withVault(async (repo) => {
    const body = JSON.stringify({
      jobs: [{
        company_name: 'Quarry Data', title: 'Platform Engineer',
        url: 'https://remotive.com/the-same-one',
        description: 'Kubernetes. Base pay is $150,000 - $180,000.',
        publication_date: new Date().toISOString(), candidate_required_location: 'Anywhere',
      }],
    });
    stubFetch(body);
    const result = await harvest(
      repo,
      ['Platform Engineer', 'Site Reliability Engineer', 'Infrastructure Engineer']
        .map((term) => ({ sourceId: 'remotive', token: term, company: term })),
      context(repo), gate(repo),
    );
    assert.equal(result.outcomes.length, 3, 'all three searches ran');
    assert.equal(result.requisitions, 1, 'the same posting was written more than once');
    assert.equal(repo.requisitions().length, 1);
  });
});

test('a posting already waiting in requisitions is not offered again', async () => {
  await withVault(async (repo) => {
    const body = JSON.stringify({
      jobs: [{
        company_name: 'Quarry Data', title: 'Platform Engineer',
        url: 'https://remotive.com/already-here',
        description: 'Kubernetes. Base pay is $150,000 - $180,000.',
        publication_date: new Date().toISOString(), candidate_required_location: 'Anywhere',
      }],
    });
    stubFetch(body);
    const target = { sourceId: 'remotive', token: 'Platform Engineer', company: 'Platform Engineer' };

    await harvest(repo, [target], context(repo), gate(repo));
    assert.equal(repo.requisitions().length, 1);

    // A second run, with the queue read fresh, must not offer it a second time.
    const again = await harvest(repo, [target], context(repo), gate(repo));
    assert.equal(again.requisitions, 0);
    assert.equal(repo.requisitions().length, 1);
  });
});
