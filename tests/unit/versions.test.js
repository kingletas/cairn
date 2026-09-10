import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Which résumé they got is the first thing an interviewer asks about, and replacing a
 *  file must not change the answer to an application already sent.
 */
test('replacing a document keeps the file it replaced', async () => {
  const { mkdtempSync, writeFileSync, existsSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { freeName } = await import('../../dist/main/documents/naming.js');

  // The new file takes a free name rather than the one already there, which is what
  // leaves the old bytes where an application can still point at them.
  const dir = mkdtempSync(join(tmpdir(), 'cairn-versions-'));
  try {
    writeFileSync(join(dir, 'resume.pdf'), 'first');
    const next = freeName('resume.pdf', (c) => existsSync(join(dir, c)));
    assert.equal(next, 'resume (2).pdf');
    writeFileSync(join(dir, next), 'second');
    assert.equal(readFileSync(join(dir, 'resume.pdf'), 'utf8'), 'first',
      'the file an application recorded was overwritten');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('what was sent is the file, not the document', () => {
  // A record can be pointed at a newer file. The name recorded on the application has
  // to be the one that went, or replacing a résumé rewrites history.
  const types = readFileSync('src/shared/types.ts', 'utf8');
  assert.match(types, /resumeFile: string \| null;/);
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.match(handlers, /const sentAs = resume === null \? null : \(r\.documents\(\)/);
  assert.match(handlers, /resumeFile: opportunity\.resumeFile \?\? sentAs,/);
});

test('an application says so when the résumé behind it has moved on', () => {
  // Otherwise the ledger names a document whose contents are not what anybody read.
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.match(handlers, /resumeReplaced: o\.resumeFile !== null/);
  assert.match(readFileSync('src/renderer/views/applications.ts', 'utf8'), /an earlier version/);
});

test('the version table records where the old file went', () => {
  const schema = readFileSync('src/main/db/schema.ts', 'utf8');
  assert.match(schema, /CREATE TABLE document_version/);
  assert.match(schema, /relative_path TEXT NOT NULL/);
  assert.match(schema, /ALTER TABLE opportunity ADD COLUMN resume_file TEXT;/);
});

test('a document that was never replaced has no versions and says nothing', () => {
  // The list is silent until there is something to say, rather than showing a heading
  // over nothing on every row.
  assert.match(readFileSync('src/renderer/views/documents.ts', 'utf8'),
    /if \(past\.length > 0\) panel\.append\(versionList\(past\)\);/);
});
