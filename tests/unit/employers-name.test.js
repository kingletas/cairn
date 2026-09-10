import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { employerKey, isExcludedCompany, normaliseExclusions, spellingsOf } from '../../dist/main/screening/employers.js';

/** Red Heron, redheron, redHEron and Red Heron ICI are one company. A list holding
 *  them as four is a list that misses three, and two of those used to reach the queue.
 */
test('one employer, however it is written down', () => {
  for (const spelling of ['Red Heron', 'redheron', 'redHEron', 'RED HERON',
                          'Red-Heron', 'Red Heron, Inc.', 'Red Heron LLC']) {
    assert.equal(isExcludedCompany(spelling, 'Red Heron'), true, `${spelling} got through`);
  }
});

test('a name that has grown a suffix is still that employer', () => {
  // A rebrand that adds a word, such as Red Heron becoming Red Heron ICI.
  assert.equal(isExcludedCompany('Red Heron ICI', 'Red Heron'), true);
  assert.equal(isExcludedCompany('Red Heron Digital', 'Red Heron'), true);
});

test('a different company that happens to share letters is left alone', () => {
  // This answer drops a lead outright, so it is biased to precision: a real role that
  // disappears is worse than one somebody rejects by hand.
  for (const other of ['Redwood', 'Heron Systems', 'Redbird', 'Red Ocean Labs', 'Heron']) {
    assert.equal(isExcludedCompany(other, 'Red Heron'), false, `${other} was wrongly dropped`);
  }
  assert.equal(isExcludedCompany('Workspace', 'Space'), false, 'a name inside a longer word is not a match');
});

test('a legal form is dropped, and a name word never is', () => {
  assert.equal(employerKey('Acme, Inc.'), employerKey('Acme'));
  assert.equal(employerKey('Siemens AG'), employerKey('Siemens'));
  assert.notEqual(employerKey('Acorn Group'), employerKey('Acorn'), 'Group is part of a name');
  assert.equal(employerKey('Co'), 'co', 'a company actually called Co keeps its name');
});

test('the list keeps one entry per employer, in the spelling first typed', () => {
  assert.deepEqual(
    normaliseExclusions(['Red Heron', 'redheron', 'redHEron', 'Red Heron, Inc.']),
    ['Red Heron']);
  assert.deepEqual(normaliseExclusions(['x', '  ', 'Oakhaven']), ['Oakhaven']);
});

test('the text of a posting is read for every spelling, not the one somebody typed', () => {
  // An agency writes a client's name however it likes.
  const spellings = spellingsOf('Red Heron, Inc.');
  assert.ok(spellings.includes('red heron'));
  assert.ok(spellings.includes('redheron'));
});

test('one rule decides it, in both places that ask', () => {
  // The sweep that sets waiting leads aside had its own lowercase-substring copy, so
  // the screen and the sweep could disagree about the same employer.
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  const sweep = /function sweepExcluded[\s\S]*?\n {2}\}/.exec(handlers);
  assert.ok(sweep !== null);
  assert.match(sweep[0], /isExcludedCompany\(requisition\.company, name\)/);
  assert.ok(!/toLowerCase\(\)/.test(sweep[0]), 'the sweep still has its own idea of a match');
});

test('a legal form after a comma is part of the name, not another name', async () => {
  // Typing "Red Heron, Inc." put Red Heron and Inc. in the list as two employers.
  const { splitList } = await import('../../dist/renderer/components/split-list.js');
  assert.deepEqual(splitList('Red Heron, Inc.'), ['Red Heron, Inc.']);
  assert.deepEqual(splitList('Acme, LLC'), ['Acme, LLC']);
  assert.deepEqual(splitList('Red Heron, Oakhaven, Acme, Inc.'), ['Red Heron', 'Oakhaven', 'Acme, Inc.']);
});

test('a pasted list is still split, and a line always wins over a comma', () => {
  return import('../../dist/renderer/components/split-list.js').then(({ splitList }) => {
    assert.deepEqual(splitList('Red Heron\nOakhaven\nLanternfish'), ['Red Heron', 'Oakhaven', 'Lanternfish']);
    assert.deepEqual(splitList('Fernwick, Oakhaven'), ['Fernwick', 'Oakhaven']);
    // One per line, and one of those lines has a comma in it.
    assert.deepEqual(splitList('Red Heron, Inc.\nOakhaven'), ['Red Heron, Inc.', 'Oakhaven']);
    assert.deepEqual(splitList('   '), []);
  });
});

test('an ampersand and the word are the same company', () => {
  // A company writes itself both ways on the same day, and stripping the symbol as
  // punctuation left Stone & Rowe and Stone and Rowe as two firms.
  for (const spelling of ['Stone & Rowe', 'Stone and Rowe', 'stoneandrowe',
                          'STONE AND ROWE', 'Stone and Rowe, Inc.']) {
    assert.equal(isExcludedCompany(spelling, 'Stone & Rowe'), true, `${spelling} got through`);
    assert.equal(isExcludedCompany(spelling, 'Stone and Rowe'), true, `${spelling} got through`);
  }
  assert.equal(employerKey('AT&T'), employerKey('AT and T'));
  assert.equal(employerKey('Marks & Spencer'), employerKey('marksandspencer'));
});

test('a name with a joining word is not the name without the rest of it', () => {
  assert.equal(isExcludedCompany('Stone', 'Stone & Rowe'), false);
  assert.equal(isExcludedCompany('Rowe', 'Stone & Rowe'), false);
});

test('two words, one word, and either case are one employer', () => {
  for (const spelling of ['Fernwick', 'fernwick', 'Fern Wick', 'FernWick', 'Fernwick LLC']) {
    assert.equal(isExcludedCompany(spelling, 'Fernwick'), true, `${spelling} got through`);
  }
  for (const spelling of ['Oakhaven Design', 'oakhavendesign', 'OakhavenDesign', 'Oakhaven  Design']) {
    assert.equal(isExcludedCompany(spelling, 'Oakhaven Design'), true, `${spelling} got through`);
  }
});

test('a misspelling is not a spelling, and Cairn does not guess', () => {
  // oakhvendesign is a typo rather than a variant. Matching it would mean matching names
  // that are merely close, on the one answer that drops a lead outright.
  assert.equal(isExcludedCompany('oakhvendesign', 'Oakhaven Design'), false);
  assert.equal(isExcludedCompany('Fernwik', 'Fernwick'), false);
});
