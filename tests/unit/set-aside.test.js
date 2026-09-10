import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Store } from '../../dist/main/db/store.js';
import { Repo } from '../../dist/main/repo.js';

const require = createRequire(import.meta.url);
const keyring = require('../../native/' + readdirSync('native').find((n) => n.endsWith('.node')));

async function withVault(run) {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-aside-'));
  const store = new Store(join(dir, 'vault.db'));
  const salt = keyring.newSalt();
  store.writeHeader(salt);
  store.open(keyring.unlock('a passphrase for one test', salt));
  try {
    return await run(new Repo(store));
  } finally {
    store.close();
    keyring.lock();
    rmSync(dir, { recursive: true, force: true });
  }
}

const lead = (id, company) => ({
  id, company, role: 'Platform Engineer', url: `https://example.test/${id}`,
  raw: '<p>A posting.</p>', sourceId: 'remotive', capturedAt: new Date().toISOString(),
  pay: null, screening: { verdicts: [], clears: true, open: [] }, state: 'waiting',
});

test('setting a lead aside hides it and does not remove it', async () => {
  // Which is the whole problem: a queue of one above a vault holding hundreds nobody
  // can see is a number that reconciles with nothing.
  await withVault((repo) => {
    for (const n of [1, 2, 3]) repo.saveRequisition(lead(String(n), `Employer ${n}`));
    repo.setRequisitionState('2', 'dropped');

    assert.deepEqual(repo.requisitionCounts(), { waiting: 2, kept: 0, dropped: 1 });
    assert.equal(repo.requisitions('waiting').length, 2, 'a set-aside lead is still in the queue');
    assert.equal(repo.requisitions('dropped').length, 1, 'a set-aside lead cannot be looked at');
  });
});

test('deleting them for good actually removes the rows', async () => {
  await withVault((repo) => {
    for (const n of [1, 2, 3]) repo.saveRequisition(lead(String(n), `Employer ${n}`));
    repo.setRequisitionState('2', 'dropped');
    repo.setRequisitionState('3', 'dropped');

    assert.equal(repo.deleteRequisitions('dropped'), 2, 'it did not say how many it removed');
    assert.deepEqual(repo.requisitionCounts(), { waiting: 1, kept: 0, dropped: 0 });
    assert.equal(repo.requisitions('dropped').length, 0, 'the rows are still there');
    assert.equal(repo.requisitions('waiting').length, 1, 'it took the queue with it');
  });
});

test('a link is forgotten when a lead is brought back, and kept when one is deleted', async () => {
  // Bringing one back without forgetting the link would put it in the queue and have
  // the next run drop it again the moment it saw it. Deleting keeps the hash on
  // purpose: it is what stops the same postings arriving all over again.
  await withVault((repo) => {
    repo.rememberDropped('a-digest-of-a-link');
    assert.ok(repo.droppedHashes().has('a-digest-of-a-link'));

    repo.forgetDropped('a-digest-of-a-link');
    assert.ok(!repo.droppedHashes().has('a-digest-of-a-link'), 'the link is still remembered');

    repo.rememberDropped('another-digest');
    repo.saveRequisition({ ...lead('9', 'Employer 9'), state: 'dropped' });
    repo.deleteRequisitions('dropped');
    assert.ok(repo.droppedHashes().has('another-digest'), 'deleting threw away what stops them returning');
  });
});
