import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeName, formatOf, freeName } from '../../dist/main/documents/naming.js';
import { readFileSync } from 'node:fs';

test('a filename cannot carry a path out of the vault', () => {
  // The name comes from a file the user chose, and it is on its way to the filesystem.
  for (const [given, expected] of [
    ['../../etc/passwd', 'passwd'],
    ['/absolute/path/resume.pdf', 'resume.pdf'],
    ['..\\windows\\thing.pdf', 'thing.pdf'],
    ['résumé v3 — infrastructure.pdf', 'résumé v3 infrastructure.pdf'],
    ['.hidden-cv.pdf', 'hidden-cv.pdf'],
  ]) {
    const safe = safeName(given);
    assert.equal(safe, expected, given);
    assert.ok(!safe.includes('/') && !safe.includes('\\\\'), given);
    assert.ok(!safe.includes('..'), given);
  }
});

test('a name that strips to nothing still gets one', () => {
  for (const nothing of ['///', '...', '   ', '..\\..\\']) {
    assert.equal(safeName(nothing), 'document', nothing);
  }
});

test('a cleaned name never starts with a dot', () => {
  // A leading dot makes a hidden file, which is a poor place to keep the résumé
  // somebody is looking for.
  for (const given of ['.hidden.pdf', '..cv.pdf', '. spaced.pdf']) {
    assert.ok(!safeName(given).startsWith('.'), given);
  }
});

test('a long name is cut rather than refused', () => {
  assert.ok(safeName('x'.repeat(400) + '.pdf').length <= 120);
});

test('the format decides what Cairn says it can do with a file', () => {
  assert.equal(formatOf('cv.pdf'), 'pdf');
  assert.equal(formatOf('CV.PDF'), 'pdf');
  assert.equal(formatOf('cv.md'), 'markdown');
  assert.equal(formatOf('cv.docx'), 'docx');
  assert.equal(formatOf('cv.pages'), 'other');
  assert.equal(formatOf('noextension'), 'other');
});

test('importing twice never replaces the first copy', () => {
  // The first copy may be the one an employer already has, and a silent overwrite
  // loses the only record of what they read.
  const taken = new Set(['resume.pdf', 'resume (2).pdf']);
  assert.equal(freeName('resume.pdf', (c) => taken.has(c)), 'resume (3).pdf');
  assert.equal(freeName('fresh.pdf', (c) => taken.has(c)), 'fresh.pdf');
});

test('the suffix goes before the extension, not after it', () => {
  const taken = new Set(['cv.pdf']);
  assert.equal(freeName('cv.pdf', (c) => taken.has(c)), 'cv (2).pdf');
});

test('a filename is cleaned the same way on every platform', () => {
  // `basename` follows the platform, so the same file was named one thing on Linux and
  // another on Windows. A vault is a thing people move between machines.
  const naming = readFileSync('src/main/documents/naming.ts', 'utf8');
  assert.doesNotMatch(naming, /\bbasename\(/,
    'safeName must not use a platform-dependent basename');
  assert.match(naming, /split\(\/\[\/\\\\\]\/\)/, 'it should split on both separators itself');
});
