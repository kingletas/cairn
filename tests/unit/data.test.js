import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  columnsToShow, columnWeights, isStructured, isWide, SHEET_COLUMNS,
  toCsv, readCsv, rolesFromCsv, readSnapshot, cell, isStamp, isLink,
} from '../../dist/main/data.js';

/** A sheet somebody corrects by hand, over the only copy of their job search. */
test('a value that holds a structure is told from a fact', () => {
  // The app reads these back with JSON.parse, so a half-typed one is not a wrong
  // value -- it is a screen that stops working.
  assert.equal(isStructured('{"min":150000}'), true);
  assert.equal(isStructured('[1,2,3]'), true);
  assert.equal(isStructured('Quarry Data'), false);
  assert.equal(isStructured('150000'), false);
  assert.equal(isStructured(null), false);
});

test('too wide for a cell is a different question from holding a structure', () => {
  // Conflating them hid the value column of the settings table, because one setting is
  // an empty list -- leaving a sheet of keys with no values against them.
  assert.equal(isWide('x'.repeat(200)), true, 'a whole posting is not a cell');
  assert.equal(isWide('[]'), false, 'an empty list is short and perfectly readable');
  assert.equal(isStructured('[]'), true, 'and it is still never edited');
});

test('a sheet opens on the columns worth reading', () => {
  // requisition carries a UUID, forty kilobytes of posting and two JSON blobs, and the
  // facts worth seeing were off the right-hand edge.
  const columns = ['id', 'company', 'raw', 'screening', 'state'];
  const rows = [['066040a630ad4cbf88dd', 'Quarry Data', 'x'.repeat(4000),
    `{"clears":true,"verdicts":${JSON.stringify(Array(9).fill('a verdict'))}}`, 'waiting']];
  assert.deepEqual(columnsToShow(columns, rows, ['id']), ['company', 'state']);
});

test('a key worth reading keeps its place, and a generated one does not', () => {
  // On the shape rather than the length: settings has a key called excludedEmployers,
  // and one long name is no reason to hide the column saying which setting a row is.
  assert.deepEqual(
    columnsToShow(['key', 'value'], [['accent', 'pine'], ['excludedEmployers', '[]']], ['key']),
    ['key', 'value']);
  assert.deepEqual(columnsToShow(['source_id', 'token'], [['greenhouse', 'gitlab']], ['source_id']),
    ['source_id', 'token']);
  assert.deepEqual(
    columnsToShow(['id', 'company'], [['066040a6-30ad-4cbf-88dd-3ba78d19ea77', 'Mitre']], ['id']),
    ['company']);
  assert.deepEqual(columnsToShow(['url_hash', 'dropped_at'], [['a3f9c2e1b7d40985', '2026-09-08']], ['url_hash']),
    ['dropped_at']);
});

test('one long value does not hide the column it is in', () => {
  // Settings keeps the last harvest as a blob and everything else as a word, and this
  // hid the column saying what every other setting is set to.
  const rows = [['accent', 'pine'], ['weekStartsOn', 'monday'], ['lastHarvest', 'x'.repeat(400)]];
  assert.deepEqual(columnsToShow(['key', 'value'], rows, ['key']), ['key', 'value']);

  // A column that is wide all the way down is still held back.
  const postings = [['a', 'x'.repeat(400)], ['b', 'y'.repeat(400)]];
  assert.deepEqual(columnsToShow(['id', 'raw'], postings, []), ['id']);
});

test('a column asks for about what it holds', () => {
  // Equal shares clip the company and the role -- the two anybody is reading -- so
  // that state can say "waiting" in a column wide enough for thirty characters.
  const weights = columnWeights(['company', 'state'], [
    ['Northrop Grumman', 'waiting'], ['Nationalindemnity', 'waiting'], ['CACI', 'waiting'],
  ]);
  assert.ok(weights.company > weights.state, 'the column anybody reads got no more room');
  assert.ok(weights.state >= 'state'.length, 'a column too narrow for its own heading');
  // And one long link cannot take the row.
  const long = columnWeights(['url'], [['https://' + 'x'.repeat(300)]]);
  assert.ok(long.url <= 30, 'one long value took the whole row');
});

test('a wide table is never wider than a screen', () => {
  // Sampling alone was not enough: a row whose structured columns happen to be null
  // makes them look like plain facts, and the sheet is twenty wide again.
  const columns = Array.from({ length: 20 }, (_, n) => `c${n}`);
  const rows = [columns.map(() => null)];
  assert.equal(columnsToShow(columns, rows, []).length, SHEET_COLUMNS);
});

test('a table of nothing but structures still shows something', () => {
  // Hiding every column reads as an empty table rather than a wide one.
  const columns = ['blob'];
  assert.deepEqual(columnsToShow(columns, [['{"a":1}']]), ['blob']);
});

test('a cell says nothing rather than showing an empty box', () => {
  // An empty cell cannot be told from an empty string, and for a pay figure that is
  // the difference between "none stated" and "zero".
  assert.equal(cell(null), '—');
  assert.equal(cell(''), '');
  assert.equal(cell(0), '0');
});

test('a description with commas and quotes survives being a csv', () => {
  const csv = toCsv({
    columns: ['role', 'note'],
    rows: [['Platform Engineer', 'Remote, mostly. They said "flexible".'], ['SRE', null]],
  });
  assert.equal(csv.split('\n')[1], 'Platform Engineer,"Remote, mostly. They said ""flexible""."');
  assert.equal(csv.split('\n')[2], 'SRE,');
});

test('a file that is not a Cairn export is refused whole', () => {
  // Read row by row until it fails, it would leave a vault holding some of somebody
  // else's data and no way to tell which rows those were.
  assert.throws(() => readSnapshot('not json at all'), /not a JSON file/);
  assert.throws(() => readSnapshot('{"tables":{}}'), /not a Cairn export/);
  assert.throws(() => readSnapshot('{"cairn":1}'), /no tables/);
  assert.throws(() => readSnapshot('{"cairn":1,"tables":{"answer":"nope"}}'), /not a list of rows/);
});

test('a real export reads back', () => {
  const snapshot = readSnapshot(JSON.stringify({
    cairn: 1, takenAt: '2026-09-08T00:00:00.000Z', tables: { answer: [{ id: 'a', answer: 'Yes' }] },
  }));
  assert.equal(snapshot.tables.answer.length, 1);
  assert.equal(snapshot.takenAt, '2026-09-08T00:00:00.000Z');
});

// --- and the guard that actually enforces it ---------------------------------

import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { Store } from '../../dist/main/db/store.js';

const require = createRequire(import.meta.url);
const keyring = require('../../native/' + readdirSync('native').find((n) => n.endsWith('.node')));

function withVault(run) {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-data-'));
  const store = new Store(join(dir, 'vault.db'));
  const salt = keyring.newSalt();
  store.writeHeader(salt);
  store.open(keyring.unlock('a passphrase for one test', salt));
  try { return run(store); } finally {
    store.close(); keyring.lock(); rmSync(dir, { recursive: true, force: true });
  }
}

test('the database itself refuses to write while a query runs', () => {
  // The shape check explains itself in a sentence. This is what makes the sentence
  // true, and it is the half that holds if the other is ever got around.
  withVault((store) => {
    store.run("INSERT INTO settings (key, value) VALUES ('a', '1')");
    assert.equal(store.read('SELECT count(*) AS n FROM settings').rows[0][0], 1);
    assert.throws(() => store.read('DELETE FROM settings'), /does not return anything/);
    assert.throws(() => store.read("INSERT INTO settings (key, value) VALUES ('b', '2')"), /does not return anything/);
    assert.equal(store.read('SELECT count(*) AS n FROM settings').rows[0][0], 1, 'a write got through');
  });
});

test('a refused query does not leave the vault read-only', () => {
  // Left set, every write in the app fails until a restart -- from one mistyped query.
  withVault((store) => {
    assert.throws(() => store.read('DELETE FROM settings'));
    assert.doesNotThrow(() => store.run("INSERT INTO settings (key, value) VALUES ('c', '3')"));
    assert.equal(store.read('SELECT count(*) AS n FROM settings').rows[0][0], 1);
  });
});

test('every table in the vault is listed with its size', () => {
  withVault((store) => {
    const names = store.tables().map((t) => t.name);
    for (const expected of ['profile', 'settings', 'opportunity', 'requisition', 'answer', 'document']) {
      assert.ok(names.includes(expected), `${expected} is missing from the table list`);
    }
    assert.ok(!names.some((n) => n.startsWith('sqlite_')), "SQLite's own bookkeeping is not somebody's data");
    assert.equal(store.tables().find((t) => t.name === 'profile').rows, 0);
  });
});

test('an error reaches the screen in the words it was written in', async () => {
  // Crossing the bridge, a thrown message arrives wrapped in the method that was being
  // invoked and the class it was thrown as -- so a sentence written for a person read
  // as plumbing talking over the app.
  const { saying } = await import('../../dist/renderer/components/dom.js');
  assert.equal(
    saying(new Error("Error invoking remote method 'data:query': NotAQuery: Only SELECT is allowed here.")),
    'Only SELECT is allowed here.');
  assert.equal(
    saying(new Error("Error invoking remote method 'boards:add': Error: That link does not look like a job board.")),
    'That link does not look like a job board.');
  // And a message that was never wrapped is left exactly as it is.
  assert.equal(saying(new Error('Use at least ten characters.')), 'Use at least ten characters.');
});

test('a fact can be corrected and a structure cannot', () => {
  withVault((store) => {
    store.run(
      "INSERT INTO requisition (id, company, role, raw, source_id, captured_at, screening, state) VALUES (?,?,?,?,?,?,?,?)",
      ['r1', 'Quarry Data', 'Platform Engineer', '<p>x</p>', 'remotive', new Date().toISOString(),
       JSON.stringify({ verdicts: [], clears: true, open: [] }), 'waiting']);

    const page = store.read('SELECT * FROM requisition');
    const at = (name) => page.columns.indexOf(name);
    assert.equal(isStructured(page.rows[0][at('screening')]), true, 'the screening blob is a structure');
    assert.equal(isStructured(page.rows[0][at('company')]), false, 'a company name is a fact');

    store.run('UPDATE requisition SET company = ? WHERE id = ?', ['Quarry Data Ltd', 'r1']);
    assert.equal(store.read('SELECT company FROM requisition WHERE id = ?', ['r1']).rows[0][0], 'Quarry Data Ltd');
  });
});

test('a row is addressed by whatever the database calls its key', () => {
  // Composite for a board, which is a source and a token. A list of key columns kept
  // here would go stale the first time a table changed.
  withVault((store) => {
    assert.deepEqual(store.primaryKey('requisition'), ['id']);
    assert.deepEqual(store.primaryKey('board'), ['source_id', 'token']);
    assert.deepEqual(store.primaryKey('settings'), ['key']);
    assert.equal(store.columnTypes('requisition').get('captured_at'), 'TEXT');
  });
});

test('removing a role takes what only made sense alongside it', () => {
  // A vault holding events about a role that is gone is how a count starts disagreeing
  // with a list. What goes is worked out from the schema, not from a list here.
  withVault((store) => {
    const now = new Date().toISOString();
    store.run('INSERT INTO opportunity (id, company, role, captured_at) VALUES (?,?,?,?)', ['o1', 'A', 'B', now]);
    store.run('INSERT INTO event (id, opportunity_id, at, kind) VALUES (?,?,?,?)', ['e1', 'o1', now, 'applied']);
    store.run('INSERT INTO event (id, opportunity_id, at, kind) VALUES (?,?,?,?)', ['e2', 'o1', now, 'reply']);
    store.run('INSERT INTO interview (id, opportunity_id, at) VALUES (?,?,?)', ['i1', 'o1', now]);
    store.run('INSERT INTO event (id, opportunity_id, at, kind) VALUES (?,?,?,?)', ['e3', 'other', now, 'note']);

    // What the handler works out: any table carrying an <name>_id column.
    const linked = store.tables()
      .filter((t) => t.name !== 'opportunity' && store.columnTypes(t.name).has('opportunity_id'))
      .map((t) => t.name);
    assert.deepEqual(linked.sort(), ['event', 'interview']);

    for (const table of linked) store.run(`DELETE FROM "${table}" WHERE opportunity_id = ?`, ['o1']);
    store.run('DELETE FROM opportunity WHERE id = ?', ['o1']);

    assert.equal(store.read('SELECT count(*) AS n FROM event').rows[0][0], 1, 'it took an unrelated event');
    assert.equal(store.read('SELECT count(*) AS n FROM interview').rows[0][0], 0);
  });
});

test('a column of addresses is not given the widest share', () => {
  const rows = [
    ['Fact Finder', 'https://example.com/jobs/a-very-long-posting-address-here'],
    ['Northwind', 'https://example.com/jobs/another-long-posting-address-here'],
  ];
  const weights = columnWeights(['company', 'url'], rows);
  assert.ok(weights.company > weights.url,
    'the company must get more room than the link nobody reads');
});

test('a csv is read back with its commas, quotes and newlines intact', () => {
  const grid = readCsv([
    'company,role,note',
    'Quarry Data,Platform Engineer,"Remote, mostly. They said ""flexible""."',
    'Ridge Labs,SRE,"Two lines',
    'in one cell"',
  ].join('\n'));
  assert.deepEqual(grid.columns, ['company', 'role', 'note']);
  assert.equal(grid.rows.length, 2);
  assert.equal(grid.rows[0][2], 'Remote, mostly. They said "flexible".');
  assert.equal(grid.rows[1][2], 'Two lines\nin one cell');
});

test('what toCsv writes is what readCsv reads', () => {
  // The two are a pair. A writer and a reader that disagree turn an export into a
  // file that only looks like a backup.
  const grid = {
    columns: ['company', 'note'],
    rows: [['Quarry Data', 'Remote, mostly. They said "flexible".'], ['Ridge Labs', 'a\nb']],
  };
  const back = readCsv(toCsv(grid));
  assert.deepEqual(back.columns, grid.columns);
  assert.deepEqual(back.rows, grid.rows);
});

test('a spreadsheet dropping its trailing empty cells is still read', () => {
  const grid = readCsv('company,role,location\nQuarry Data,SRE\n');
  assert.deepEqual(grid.rows, [['Quarry Data', 'SRE', '']]);
});

test('a byte-order mark does not become part of the first column name', () => {
  const grid = readCsv('\uFEFFcompany,role\nQuarry Data,SRE\n');
  assert.deepEqual(grid.columns, ['company', 'role']);
});

test('a file with no header row is refused', () => {
  assert.throws(() => readCsv(''), /no header row/);
  assert.throws(() => readCsv(',,\n'), /no header row/);
});

test('the headings a person actually types are recognised', () => {
  const read = rolesFromCsv(readCsv([
    'Employer,Job Title,Link,City,Comments',
    'Quarry Data,Platform Engineer,https://example.test/1,Remote,Applied in March',
  ].join('\n')));
  assert.deepEqual(read.rows, [{
    company: 'Quarry Data',
    role: 'Platform Engineer',
    url: 'https://example.test/1',
    location: 'Remote',
    notes: 'Applied in March',
  }]);
  assert.deepEqual(read.ignored, []);
});

test('a spreadsheet with no company or no role column is refused whole', () => {
  // Importing part of somebody's other spreadsheet leaves a pipeline nobody trusts,
  // and the message names the columns so it is clear which file was opened.
  assert.throws(() => rolesFromCsv(readCsv('name,amount\nRent,1200\n')),
    /no company and no role column/);
  assert.throws(() => rolesFromCsv(readCsv('company,amount\nQuarry Data,1200\n')),
    /no role column/);
  assert.throws(() => rolesFromCsv(readCsv('company,amount\nQuarry Data,1200\n')),
    /company, amount/);
});

test('a row with no company or no role is counted rather than guessed at', () => {
  const read = rolesFromCsv(readCsv([
    'company,role,salary',
    'Quarry Data,SRE,150000',
    ',Platform Engineer,140000',
    'Ridge Labs,,130000',
  ].join('\n')));
  assert.equal(read.rows.length, 1);
  assert.equal(read.incomplete, 2);
  assert.deepEqual(read.ignored, ['salary']);
});

test('a column nothing was read out of is named rather than dropped in silence', () => {
  // A spreadsheet carries a stage, a date and a contact that Cairn has no place for
  // yet. Saying so is the difference between an import and a quiet loss.
  const read = rolesFromCsv(readCsv('company,role,stage,contact\nQuarry Data,SRE,Phone screen,Dana\n'));
  assert.deepEqual(read.ignored, ['stage', 'contact']);
});

/** A sheet is for correcting facts. A column nobody can edit, or nobody can read, is
 *  width spent on nothing.
 */
const REQUISITION = ['id', 'company', 'role', 'url', 'raw', 'source_id', 'captured_at', 'screening', 'state', 'pay'];
const requisitionRows = (n) => Array.from({ length: n }, (_, i) => ([
  `0f8a1b2c3d4e5f60718293a4b5c6d7e${i % 10}`,
  ['Quarry Data', 'Ridge Labs', 'Fathom'][i % 3],
  ['Platform Engineer', 'SRE', 'Backend Engineer'][i % 3],
  `https://example.test/jobs/${i}`,
  'A very long posting description. '.repeat(6),
  ['greenhouse', 'lever'][i % 2],
  '2026-09-08T14:53:06.000Z',
  '{"verdicts":[{"check":"pay-floor","how":"pass"}]}',
  'waiting',
  '{"min":150000,"max":180000,"currency":"USD"}',
]));

test('a sheet drops what cannot be edited and what cannot be read', () => {
  const shown = columnsToShow(REQUISITION, requisitionRows(12), ['id']);
  for (const gone of ['id', 'url', 'raw', 'screening', 'pay']) {
    assert.ok(!shown.includes(gone), `${gone} is on the sheet and nothing can be done with it there`);
  }
  assert.deepEqual(shown, ['company', 'role', 'source_id', 'state']);
});

test('a timestamp shows only when nothing else would', () => {
  // Beside a company and a role it is width spent on nothing. A table of hashes and
  // dates is entirely dates, and a sheet showing none of its columns is worse.
  const withFacts = ['id', 'at', 'host', 'reason'];
  const rows = Array.from({ length: 6 }, (_, i) => ([
    `abcdef01234567890abcdef01234567${i}`,
    `2026-09-08T14:0${i}:00.000Z`,
    ['boards-api.greenhouse.io', 'api.lever.co'][i % 2],
    'harvest',
  ]));
  assert.deepEqual(columnsToShow(withFacts, rows, ['id']), ['host', 'reason']);

  const dropped = ['url_hash', 'dropped_at'];
  const hashes = Array.from({ length: 4 }, (_, i) => ([`a3f9c2e1b7d4098${i}`, `2026-09-0${i + 1}T09:00:00.000Z`]));
  assert.deepEqual(columnsToShow(dropped, hashes, ['url_hash']), ['dropped_at']);
});

test('a column with one value in it is a fact about the table, not about a row', () => {
  const columns = ['company', 'state'];
  const rows = Array.from({ length: 9 }, (_, i) => ([['A', 'B', 'C'][i % 3], 'waiting']));
  assert.deepEqual(columnsToShow(columns, rows, []), ['company', 'state']);
});

test('a table of nothing but links and structures still shows itself', () => {
  // Held back to the last column, a sheet reads as an empty table rather than one whose
  // every column is a blob.
  const columns = ['url', 'screening'];
  const rows = [['https://example.test/1', '{"a":1}'], ['https://example.test/2', '{"a":2}']];
  assert.deepEqual(columnsToShow(columns, rows, []), ['url', 'screening']);
});

test('a moment a machine wrote is told from a day somebody chose', () => {
  // The day something is due is a decision and belongs on the sheet; the moment a
  // posting was captured is not, and nobody scans it.
  assert.equal(isStamp('2026-09-08T14:53:06.000Z'), true);
  assert.equal(isStamp('2026-09-08'), false, 'a plain date is somebody\u2019s choice, not a stamp');
  assert.equal(isStamp('waiting'), false);
  assert.equal(isStamp(null), false);
});

test('a link is told from text that happens to mention one', () => {
  assert.equal(isLink('https://example.test/jobs/1'), true);
  assert.equal(isLink('http://example.test'), true);
  assert.equal(isLink('Apply at https://example.test'), false, 'prose is not a link column');
  assert.equal(isLink(42), false);
});
