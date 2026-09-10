import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** The pipeline taught what a list in Cairn is, and the other three each honoured a
 *  different half of it. A screen that can do a thing and then a sibling that cannot
 *  reads as the app taking something away. */

const LISTS = {
  pipeline: 'src/renderer/views/pipeline.ts',
  applications: 'src/renderer/views/applications.ts',
  leads: 'src/renderer/views/requisitions.ts',
  preflight: 'src/renderer/views/preflight.ts',
};

test('every list is tabbed, paged and shaped', () => {
  for (const [name, file] of Object.entries(LISTS)) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /sections\(\{/, `${name} should be tabbed`);
    assert.match(source, /paged\(/, `${name} should be paged`);
    assert.match(source, /shapes: \['list'/, `${name} should offer a shape`);
  }
});

test('a filter has a way back to everything', () => {
  for (const name of ['pipeline', 'applications', 'preflight']) {
    const source = readFileSync(LISTS[name], 'utf8');
    assert.match(source, /'all'/, `${name} should have an All`);
  }
});

test('a count is a number, not a number in brackets', () => {
  const leads = readFileSync(LISTS.leads, 'utf8');
  assert.doesNotMatch(leads, /\(\$\{\w+(\.\w+)*\}\)/, 'leads used brackets and nothing else did');
  assert.match(leads, /`Waiting \$\{waitingRows\.length\}`/,
    'the tab counts what the list holds, which is what a narrowing left in it');
});

test('the board belongs to the pipeline alone', () => {
  // A column is somewhere a card can go. Nowhere else here has one.
  for (const name of ['applications', 'leads', 'preflight']) {
    const source = readFileSync(LISTS[name], 'utf8');
    assert.match(source, /if \(next === 'board'\) return;/, `${name} should refuse a board`);
  }
});

test('a preflight row is the control, not a button beside it', () => {
  // Open sat in a third of the width of the thing you were aiming at, and the row it
  // belonged to did nothing at all. The chevron is drawn in the stylesheet, so no glyph
  // reaches the phrase list.
  const preflight = readFileSync(LISTS.preflight, 'utf8');
  assert.match(preflight, /el\('button', \{\s*\n?\s*class: `row opens/, 'the row has to be the button');
  assert.doesNotMatch(preflight, /'Open'/, 'the Open button is back');
  assert.match(preflight, /el\('span', \{ class: 'opensign' \}\)/, 'nothing says the row can be opened');
  const css = readFileSync('src/renderer/styles/app.css', 'utf8');
  // The two borders and the rotation are the chevron. A rule that only positions it
  // leaves an empty box, and the row loses the one thing saying it can be opened.
  assert.match(css, /^\.row\.opens \.opensign \{[^}]*border-top:[^}]*border-right:[^}]*rotate\(45deg\)/ms,
    'the chevron is not drawn');
  assert.doesNotMatch(preflight, /opensign' \}, '/, 'the chevron must carry no text');
});

test('a check says nothing its own tab already said', () => {
  // "No gate — Gate not-run" is the check named twice, and on the check's own tab the
  // reason was the tab title repeated down every row.
  const preflight = readFileSync(LISTS.preflight, 'utf8');
  assert.match(preflight, /if \(state !== 'partial'\) return '';/,
    'a state the tab already names adds nothing');
  assert.match(preflight, /required \$\{blanks\.length === 1 \? 'box' : 'boxes'\} undrafted/,
    'and the one thing the title cannot carry is said');
  assert.doesNotMatch(preflight, /no channel`/, 'the channel check must not repeat its own tab');
  assert.match(preflight, /\[check\.title, said\]\.filter\(\(one\) => one !== ''\)/,
    'an empty reason has to drop out of the line rather than leave a dash');
  assert.match(preflight, /why === '' \? null :/, 'an empty reason must not leave an empty element');
});
