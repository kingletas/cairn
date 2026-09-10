import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Store } from '../../dist/main/db/store.js';
import { Repo } from '../../dist/main/repo.js';

/** What survives the moment a lead becomes a role. The posting is the evidence and the
 *  reading of it is the work, and the reading used to be dropped here: a role that came
 *  in through Cairn's own front door showed no band, on the pay filter that found it. */

const require = createRequire(import.meta.url);
const keyring = require('../../native/' + readdirSync('native').find((n) => n.endsWith('.node')));

async function withVault(run) {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-handover-'));
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

const money = {
  min: 155000, max: 220000, currency: 'CAD', period: 'year',
  provenance: 'first-party', evidence: 'The range is $155,000—$220,000 CAD per year.',
};

const screening = {
  verdicts: [{ check: 'pay-floor', outcome: 'unknown', because: 'Not compared.', evidence: money.evidence }],
  clears: true,
  open: ['Is this a fit?'],
};

test('a requisition remembers what the screens read', async () => {
  await withVault((repo) => {
    repo.saveRequisition({
      id: '1', company: 'Quarry Data', role: 'Platform Engineer',
      url: 'https://example.test/1', raw: '<p>A posting.</p>', sourceId: 'remotive',
      capturedAt: new Date().toISOString(), pay: money, remote: 'hybrid', screening, state: 'waiting',
    });
    const back = repo.requisitions()[0];
    assert.equal(back.remote, 'hybrid');
    assert.equal(back.pay.currency, 'CAD');
    assert.equal(back.screening.verdicts.length, 1);
  });
});

test('a role keeps the reading, not only the posting it was read out of', async () => {
  await withVault((repo) => {
    repo.saveOpportunity({
      id: 'r1', company: 'Quarry Data', role: 'Platform Engineer', url: null, location: null,
      remote: 'hybrid', pay: money, stage: 'considering', fit: null, family: null,
      nextAction: null, nextActionDue: null, postedAt: null, capturedAt: '2026-09-01',
      appliedAt: null, resumeFile: null, resumeId: null, archivedAt: null, notes: null,
      gate: null, blocker: null, concession: null, contact: null, followupChannel: null,
      posting: 'A posting.', screening,
    });
    const back = repo.opportunities()[0];
    assert.equal(back.remote, 'hybrid');
    assert.equal(back.pay.max, 220000);
    assert.equal(back.screening.verdicts[0].check, 'pay-floor');
    assert.equal(back.screening.verdicts[0].evidence, money.evidence,
      'the sentence a verdict was read out of is the part a person can disagree with');
  });
});

test('a role with nothing read keeps saying so', async () => {
  await withVault((repo) => {
    repo.saveOpportunity({
      id: 'r2', company: 'Added By Hand', role: 'Platform Engineer', url: null, location: null,
      remote: 'unstated', pay: null, stage: 'considering', fit: null, family: null,
      nextAction: null, nextActionDue: null, postedAt: null, capturedAt: '2026-09-01',
      appliedAt: null, resumeFile: null, resumeId: null, archivedAt: null, notes: null,
      gate: null, blocker: null, concession: null, contact: null, followupChannel: null,
      posting: null, screening: null,
    });
    assert.equal(repo.opportunities()[0].screening, null);
  });
});

test('everything already here counts for the duplicate rule, from both tables', async () => {
  await withVault(async (repo) => {
    const { pairKey } = await import('../../dist/main/screening/checks.js');
    repo.saveRequisition({
      id: '1', company: 'Quarry Data, Inc.', role: 'Platform Engineer', url: null,
      raw: '', sourceId: 'remotive', capturedAt: '2026-09-01', pay: null,
      remote: 'unstated', screening, state: 'waiting',
    });
    const pairs = repo.knownPairs();
    assert.equal(pairs.has(pairKey('Quarry Data', 'Platform Engineer')), true,
      'a spelling of the same employer is the same employer');
    assert.equal(pairs.has(pairKey('Quarry Data', 'Staff Engineer')), false);
  });
});

test('taking a lead hands the whole of it over', () => {
  // The handler is what does the copying, and the fields it copies are the finding.
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  const keep = handlers.slice(handlers.indexOf("ipcMain.handle('requisitions:keep'"));
  assert.match(keep, /remote: requisition\.remote, pay: requisition\.pay,/);
  assert.match(keep, /screening: requisition\.screening,/);
});
