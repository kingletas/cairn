import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The wires, checked from both ends. */
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') || full.endsWith('.js') ? [full] : [];
  });
}

const source = (dir) => walk(dir).map((f) => readFileSync(f, 'utf8')).join('\n');
const preload = readFileSync('src/preload/index.ts', 'utf8');
const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
const renderer = source('src/renderer');
const main = source('src/main');
const types = readFileSync('src/shared/types.ts', 'utf8');

const fields = (name) => {
  const block = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(types);
  return block === null ? [] : [...block[1].matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);
};

test('every handler can be reached, and every call has a handler', () => {
  const handled = new Set([...handlers.matchAll(/ipcMain\.handle\(\s*'([^']+)'/g)].map((m) => m[1]));
  const invoked = new Set([...preload.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)].map((m) => m[1]));
  assert.ok(handled.size > 50, 'the handler list looks wrong');
  assert.deepEqual([...handled].filter((c) => !invoked.has(c)), [],
    'these handlers exist and the interface has no way to call them');
  assert.deepEqual([...invoked].filter((c) => !handled.has(c)), [],
    'these calls would fail: no handler answers them');
});

test('every way in is used by the interface', () => {
  // A method on the bridge that nothing calls is a feature nobody can reach: the one
  // that makes an interview was the whole Interviews page, unreachable for sessions.
  const dead = [];
  let group = null;
  for (const line of preload.split('\n')) {
    const opens = /^ {2}(\w+): \{$/.exec(line);
    if (opens !== null) { group = opens[1]; continue; }
    if (/^ {2}\},?$/.test(line)) { group = null; continue; }
    const method = /^ {4}(\w+):/.exec(line);
    if (group === null || method === null) continue;
    if (!new RegExp(`\\b${group}\\s*\\.\\s*${method[1]}\\b`).test(renderer)) {
      dead.push(`window.cairn.${group}.${method[1]}`);
    }
  }
  assert.deepEqual(dead, [], 'nothing in the app calls these, so nobody can reach what they do');
});

test('every setting is read by something and can be changed by somebody', () => {
  // Both halves have been wrong. The excluded employers list was read by a screen that
  // drops leads outright and could not be set from anywhere; the harvest schedule
  // could be set and nothing anywhere acted on it.
  const ui = readFileSync('src/renderer/views/settings.ts', 'utf8')
    + readFileSync('src/renderer/views/setup.ts', 'utf8')
    + readFileSync('src/renderer/views/privacy.ts', 'utf8');
  // Written by Cairn about itself rather than chosen by anybody, so there is nothing
  // for a screen to offer. Kept as a named list rather than a rule about shape,
  // because "it looks like state" is exactly how a real setting would slip through.
  const RECORDED = new Set(['lastHarvest', 'lastBackupAt']);
  const unread = [];
  const unsettable = [];
  for (const key of fields('Settings')) {
    const looked = new RegExp(`\\.${key}\\b`);
    if (!looked.test(main.replace(/SETTING_DEFAULTS[\s\S]*?\n\};/, '')) && !looked.test(renderer)) unread.push(key);
    if (!ui.includes(key) && !RECORDED.has(key)) unsettable.push(key);
  }
  assert.ok(RECORDED.size <= 2, 'the list of things nobody sets is growing, which is how this check stops meaning anything');
  assert.deepEqual(unread, [], 'nothing reads these, so setting them does nothing');
  assert.deepEqual(unsettable, [], 'these decide how Cairn behaves and nothing can change them');
});

test('every thing you are asked about yourself is used to judge a posting', () => {
  // A profile field no screen compares anything to reads as a promise that one does, so
  // the read has to be somewhere that judges rather than the form that collects it.
  const judging = walk('src/main')
    .filter((f) => !f.endsWith('repo.ts'))
    .map((f) => readFileSync(f, 'utf8')).join('\n');
  const unread = fields('Profile').filter((key) => !new RegExp(`\\.${key}\\b`).test(judging));
  assert.deepEqual(unread, [], 'setup asks for these and no screen ever reads them');
});

test('nothing is stored that nothing ever reads', () => {
  // A table and a column sat in the first migration, queried by nothing, for the whole
  // life of the app. Empty schema is not free: it tells the next person that companies
  // are stored somewhere and that a source carries configuration, and both were false.
  const schema = readFileSync('src/main/db/schema.ts', 'utf8');
  const elsewhere = walk('src/main')
    .filter((f) => !f.endsWith('schema.ts'))
    .map((f) => readFileSync(f, 'utf8')).join('\n');

  const columns = new Map();
  for (const [, table, body] of schema.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n {6}\);/g)) {
    columns.set(table, [...body.matchAll(/^\s{8}([a-z_]+)\s+(?:TEXT|INTEGER|REAL|BLOB)/gm)].map((m) => m[1]));
  }
  for (const [, table, column] of schema.matchAll(/ALTER TABLE (\w+) ADD COLUMN ([a-z_]+)/g)) {
    columns.set(table, [...(columns.get(table) ?? []), column]);
  }
  const dropped = new Set([...schema.matchAll(/DROP COLUMN ([a-z_]+)/g)].map((m) => m[1]));
  const goneTables = new Set([...schema.matchAll(/DROP TABLE IF EXISTS (\w+)/g)].map((m) => m[1]));

  assert.ok(columns.size >= 8, 'the schema scan found almost nothing, so it is checking nothing');
  const unused = [];
  for (const [table, cols] of columns) {
    if (goneTables.has(table)) continue;
    if (!new RegExp(`\\b(FROM|INTO|UPDATE|TABLE) ${table}\\b`).test(elsewhere)) {
      unused.push(`table ${table}`);
      continue;
    }
    for (const column of cols) {
      if (column === 'id' || dropped.has(column)) continue;
      if (!new RegExp(`\\b${column}\\b`).test(elsewhere)) unused.push(`${table}.${column}`);
    }
  }
  assert.deepEqual(unused, [], 'these are written into every vault and nothing ever reads them');
});

// The page's own policy forbids inline styles, so a `style` attribute is silently
// dropped. Four features had been relying on one. These two checks are a pair: the
// policy stays strict, and the helper puts styles somewhere the policy does not reach.
test('styles are applied through the object, not the attribute', () => {
  const dom = readFileSync('src/renderer/components/dom.ts', 'utf8');
  assert.match(dom, /key === 'style'\) node\.style\.cssText/,
    'el() must set styles through node.style, or every style attribute is ignored');
});

test('the page keeps a policy that forbids inline styles', () => {
  const page = readFileSync('src/renderer/index.html', 'utf8');
  assert.match(page, /style-src 'self'/, 'the style policy is missing');
  assert.ok(!page.includes('unsafe-inline'),
    "loosening the policy to 'unsafe-inline' is not the fix for a dropped style");
});

test('every exported function in main is reached from somewhere', () => {
  // toCsv was written and tested and nothing called it, so the code and the test names
  // both read as a shipped CSV export while the button did not exist.
  const dead = [];
  for (const file of walk('src/main')) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/^export (?:async )?function (\w+)/gm)) {
      const name = match[1];
      const readers = walk('src/main')
        .concat(walk('src/renderer'), ['src/preload/index.ts'], walk('tests/unit'))
        .filter((one) => one !== file);
      const elsewhere = readers.some((one) => new RegExp(`\\b${name}\\b`).test(readFileSync(one, 'utf8')));
      if (!elsewhere) dead.push(`${file.replace('src/main/', '')} — ${name}`);
    }
  }
  assert.deepEqual(dead, [], 'these are exported, and nothing outside their own module calls them');
});

test('nothing in the renderer reloads the page, because the window refuses to navigate', () => {
  // `will-navigate` is refused, so location.reload() is a silent no-op. Three screens
  // relied on it: Lock vault wiped the key and left every record on screen.
  const offenders = walk('src/renderer')
    .filter((file) => !file.endsWith('restart.ts'))
    .filter((file) => /location\s*\.\s*reload\s*\(/.test(readFileSync(file, 'utf8')))
    .map((file) => file.replace('src/renderer/', ''));
  assert.deepEqual(offenders, [], 'these call location.reload(); use restart() instead');
});

test('the vault says when it locks, and the interface listens', () => {
  // Locking has three causes nobody presses -- the idle timer, suspend, the screen
  // locking -- and none of them redrew anything.
  assert.match(readFileSync('src/main/index.ts', 'utf8'), /vault\.onLock\(/);
  assert.match(preload, /'vault:locked'/);
  assert.match(readFileSync('src/renderer/app.ts', 'utf8'), /vault\.onLocked\(/);
});

test('the shell re-reads its settings and its status, not just its lists', () => {
  // Held by value, a setting changed on one screen was still the old one on the next,
  // and the bar along the bottom never moved after boot: no backup, nothing outbound.
  const shell = readFileSync('src/renderer/views/app.ts', 'utf8');
  const reread = /const reread = async[\s\S]*?\n {2}};/.exec(shell);
  assert.ok(reread !== null, 'the shell should have one place that re-reads everything');
  for (const call of ['settings.get()', 'vault.status()', 'opportunities.list()', 'requisitions.list()']) {
    assert.ok(reread[0].includes(call), `re-reading skips ${call}, so that goes stale until a restart`);
  }
});

test('a board source turned on with nothing to poll says so where it was turned on', () => {
  // The only place that said so was the Harvest tab, which is not where somebody is
  // standing when they flip the switch.
  const feeds = readFileSync('src/renderer/views/sources.ts', 'utf8');
  assert.match(feeds, /state\.enabled && state\.boards === 0/,
    'the Feeds row should notice a board family with no employers');
  assert.match(feeds, /polling nothing/, 'and say so in the row');
});

test('moving between views reads the vault again', () => {
  // A role kept on the requisitions screen was in the vault and not in the list the
  // pipeline drew from, because the shell only re-read when a screen asked it to.
  const shell = readFileSync('src/renderer/views/app.ts', 'utf8');
  const nav = /navigate = \(view: ViewId[^)]*\)[\s\S]*?\n {2}};/.exec(shell);
  assert.ok(nav !== null, 'the shell should have one place that moves between views');
  assert.match(nav[0], /reread\(\)/, 'moving to a view should re-read before trusting what it draws');
});

test('settling a lead recounts, because it moved one', () => {
  const requisitions = readFileSync('src/renderer/views/requisitions.ts', 'utf8');
  const settle = /function settle\([\s\S]*?\n\}/.exec(requisitions);
  assert.ok(settle !== null);
  assert.match(settle[0], /refreshCounts\(\)/, 'keeping or dropping a lead changes two counts in the rail');
});

test('the rail carries what you asked to be called', () => {
  // The machine name exists to tell two machines apart, not to name a person, and it
  // was the only thing under the app's name.
  assert.match(handlers, /displayName: unlocked \? repo\(\)\.profile\(\)\.displayName/);
  const shell = readFileSync('src/renderer/views/app.ts', 'utf8');
  assert.match(shell, /status\.displayName[\s\S]{0,200}status\.machineName/,
    'the name comes first and the machine name is the fallback');
});

test('Today says what the daily notice says', () => {
  // The notification led with interviews today; the screen called Today never mentioned
  // an interview at all, so the two disagreed about what mattered today.
  const today = readFileSync('src/renderer/views/today.ts', 'utf8');
  assert.match(today, /interviews\.next\(\)/, 'Today reads no interviews');
  const notify = readFileSync('src/main/notify.ts', 'utf8');
  assert.match(notify, /interview/i, 'the daily notice should be the thing Today agrees with');
});

test('a renamed stage is renamed everywhere it is named', () => {
  // A stage name written into a string is one the rename cannot reach, and the screen
  // would then say "arrives in Considering" about a column headed something else. The
  // five words live in the shared default, which is the one place they belong.
  const fixed = [];
  for (const file of walk('src/renderer')) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, at) => {
      if (/\b(Considering|Preparing|Applied|Interviewing|Decision)\b/.test(line)) {
        fixed.push(`${file.replace('src/renderer/', '')}:${at + 1}`);
      }
    });
  }
  assert.deepEqual(fixed, [], 'these name a stage in fixed text, so renaming one leaves them wrong');
});

test('the five stages stay five, because three of them do something', () => {
  // Reaching Applied records the date and starts the clock on the silence; Interviewing
  // is counted in the rail and on Today; Decision is where nothing moves on from.
  const types = readFileSync('src/shared/types.ts', 'utf8');
  const list = /export const STAGES[\s\S]*?as const;/.exec(types);
  assert.ok(list !== null);
  assert.equal((list[0].match(/'/g) ?? []).length / 2, 5, 'the set of stages is not a setting');
});
