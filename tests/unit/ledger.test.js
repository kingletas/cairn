import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const applications = readFileSync('src/renderer/views/applications.ts', 'utf8');

/** The table had five columns and three of them said the same thing on every row of
 *  the list you were looking at: "not recorded" twenty times, "Sent" on every row of
 *  Waiting, and twenty identical buttons. */

test('the employer leads the row', () => {
  // It was the small grey line under the title, which is the wrong way round -- the
  // employer is what somebody is looking for.
  assert.match(applications, /el\('b', \{\}, mask\.company\(o\.company\)\), el\('small', \{\}, o\.role\)/);
});

test('a cell that says one thing on every row is not drawn', () => {
  // In Waiting, "where it got to" reads Sent on all of them.
  assert.match(applications, /if \(group !== 'waiting'\) \{/);
});

test('an application is a row, not a table', () => {
  // A table needs a header to say what its columns are, which is how three of them
  // became one word repeated down the page under a heading explaining it.
  assert.match(applications, /class: `row appline \$\{group\}\$\{layout === 'grid'/);
  assert.doesNotMatch(applications, /ledgerhead/, 'the header row went with the table');
  // A row says what it is as it goes.
  assert.match(applications, /`Sent \$\{sentOn\(o\.appliedAt\)\}`/);
  assert.match(applications, /\} quiet`/, 'the wait says what it is without a header');
});

test('which resume went is kept, beside the dates rather than as a column', () => {
  assert.match(applications, /class: 'sentwith'/);
  assert.match(applications, /Sent with \$\{row\.resume\.title\}/);
  assert.doesNotMatch(applications, /'not recorded'/, 'a column of it answered nothing');
});

test('the figures and the count are one line, not two competing ones', () => {
  // A sentence beside the count is two labels in one corner, at two type sizes. The
  // reply rate rides inside the count instead.
  assert.match(applications, /note: `\$\{open\} still open · \$\{rate\}% answered`/);
  assert.doesNotMatch(applications, /summaryline/);
});

test('the rail and the screen say which number is which', () => {
  // The rail counts what is still open and the first tab counts everything ever sent.
  // Both are right, and one word carried them with nothing saying they differ.
  assert.match(applications, /const open = groups\.waiting\.length \+ groups\.heard\.length;/);
});

test('a list remembers its own shape, apart from the pipeline', () => {
  // Sharing one setting meant choosing the board on the pipeline quietly put the other
  // three back to a list.
  assert.match(applications, /settings\.listLayout/);
  assert.match(applications, /settings\.set\('listLayout'/);
});
