import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { search, terms } from '../../dist/main/search.js';

/** Finding a thing again, wherever it is. */
const rows = [
  { kind: 'role', id: 'r1', title: 'Platform Engineer', detail: 'Quarry Data · applied',
    text: ['Quarry Data', 'Platform Engineer', 'Remote', 'Chase after the 20th', 'They use Kubernetes heavily'] },
  { kind: 'role', id: 'r2', title: 'Site Reliability Engineer', detail: 'Ridge Labs · considering',
    text: ['Ridge Labs', 'Site Reliability Engineer', '', '', ''] },
  { kind: 'answer', id: 'a1', title: 'Why this company?', detail: 'Answer bank',
    text: ['Why this company?', 'Because the platform work is the product rather than a cost centre.'] },
  { kind: 'document', id: 'd1', title: 'Resume', detail: 'Résumé', text: ['Resume', 'The one I send most'] },
];

test('a word that is not there finds nothing', () => {
  assert.deepEqual(search('kafka', rows), []);
  assert.deepEqual(search('', rows), []);
  assert.deepEqual(search('a', rows), [], 'one letter matches everything and means nothing');
});

test('two words narrow rather than widen', () => {
  // Matching any word would hand back the noise somebody was narrowing away from.
  const one = search('engineer', rows).map((f) => f.id);
  assert.deepEqual(one.sort(), ['r1', 'r2']);
  assert.deepEqual(search('reliability engineer', rows).map((f) => f.id), ['r2']);
  assert.deepEqual(search('engineer kafka', rows), []);
});

test('a whole field beats the start of a word, which beats a mention', () => {
  const found = search('resume', rows);
  assert.equal(found[0].id, 'd1');
  const kubernetes = search('kubernetes', rows);
  assert.equal(kubernetes.length, 1, 'a note is searched too');
  assert.ok(kubernetes[0].score < found[0].score, 'a mention should not outrank a name');
});

test('a result says why it is a result', () => {
  const [found] = search('kubernetes', rows);
  assert.match(found.evidence, /Kubernetes/);
  assert.equal(search('platform', rows)[0].kind, 'role');
});

test('an answer is searched by what it says, not only what it asks', () => {
  assert.deepEqual(search('cost centre', rows).map((f) => f.id), ['a1']);
});

test('words are split on punctuation and keep what a technology needs', () => {
  assert.deepEqual(terms('C++ and .NET, node.js'), ['c++', 'and', '.net', 'node.js']);
});

test('nothing is indexed, so nothing can go stale', () => {
  // The specification had a "Rebuild the search index" button. A vault holds thousands
  // of rows rather than millions, and an index for that is a second copy to keep true.
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.ok(!/searchIndex|rebuildIndex|CREATE VIRTUAL TABLE/.test(handlers));
  assert.match(handlers, /'search:everything'/);
});

test('every kind the search returns knows which screen it lives on', () => {
  // A result nobody can open is worse than one nobody found.
  const find = readFileSync('src/renderer/components/find.ts', 'utf8');
  for (const kind of ['role', 'lead', 'answer', 'document', 'interview']) {
    assert.match(find, new RegExp(`${kind}: \\{ label:`), `${kind} results go nowhere`);
  }
});

test('evidence is left out when it only repeats the row', () => {
  // A quote of the title, under the title, costs a row of height and answers nothing.
  const [role] = search('platform', rows);
  assert.equal(role.evidence, null, 'the title already says it');
  const [note] = search('kubernetes', rows);
  assert.match(note.evidence, /Kubernetes heavily/, 'a note says something the row does not');
});

test('the box says what it is before anybody has typed', async () => {
  // A lone input over a page reads as something broken rather than as a dialog: what
  // it searches, and how to close it, before there is anything to show.
  const { readFileSync } = await import('node:fs');
  const find = readFileSync('src/renderer/components/find.ts', 'utf8');
  assert.match(find, /Roles, leads, answers, documents and interviews/);
  assert.match(find, /'Esc'/, 'the way out should be on screen, not remembered');
  const rest = (find.match(/atRest\(\)/g) ?? []).length;
  assert.ok(rest >= 4, 'the resting state should come back on open, on close and on clearing');
});
