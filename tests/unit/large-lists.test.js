import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** A list that draws everything stops being a list. At 35,700 roles the pipeline was
 *  158,941 elements and 1.1 million pixels of scroll, and took five seconds to appear;
 *  the applications table was worse. These check the shape that fixed it, because the
 *  cost only shows up at a size no fixture is going to carry. */

test('the pipeline shows one stage at a time', () => {
  const pipeline = readFileSync('src/renderer/views/pipeline.ts', 'utf8');
  assert.match(pipeline, /sections\(\{/, 'stages should be tabs, not one long page');
  assert.match(pipeline, /label: `\$\{LABELS\(stage\)\} \$\{/, 'a tab should carry its count');
  assert.match(pipeline, /id: 'aside'/, 'what was set aside is a stage you can open');
});

test('every long list is paged', () => {
  for (const file of ['src/renderer/views/pipeline.ts', 'src/renderer/views/applications.ts',
                      'src/renderer/views/preflight.ts', 'src/renderer/views/requisitions.ts']) {
    assert.match(readFileSync(file, 'utf8'), /paged\(/, `${file} should page its list`);
  }
});

test('a page is one of four sizes, and the count says which of how many', () => {
  const pager = readFileSync('src/renderer/components/paged.ts', 'utf8');
  // Ten is a screenful and a hundred is as far as this goes: past that the page is the
  // problem rather than the page size.
  assert.match(pager, /PAGE_SIZES: readonly PageSize\[\] = \[10, 20, 50, 100\]/);
  assert.match(pager, /\$\{from \+ 1\}–\$\{from \+ shown\.length\} of \$\{items\.length\}/,
    'the bar should say which of how many, not just that there are more');
  assert.match(pager, /aria-label': 'How many per page'/, 'the size control is a select and is named');
});

test('changing the page size keeps you where you were', () => {
  const pager = readFileSync('src/renderer/components/paged.ts', 'utf8');
  // Twenty per page starting at row 40 is page 2, not page 4. Recomputing from the
  // first row shown is what stops the size control also moving you.
  assert.match(pager, /const first = page\.at \* size;[\s\S]{0,220}page\.at = Math\.floor\(first \/ size\)/);
});

test('the page a list is on survives a redraw', () => {
  // Held by the caller rather than the component, or moving a role would send you back
  // to the first page of a list you were halfway down.
  const pager = readFileSync('src/renderer/components/paged.ts', 'utf8');
  assert.match(pager, /export interface Page \{ at: number \}/);
  assert.match(readFileSync('src/renderer/views/pipeline.ts', 'utf8'), /const page: Page = \{ at: 0 \}/);
});

test('the shapes are one control, because they are one choice', () => {
  const pager = readFileSync('src/renderer/components/paged.ts', 'utf8');
  // The control is the shape you are in, drawn rather than written -- a glyph in the
  // markup would be a phrase every catalogue has to carry.
  assert.match(pager, /LAYOUT_NAME: Record<Settings\['pipelineLayout'\], string> = \{/);
  assert.match(pager, /'aria-label': LAYOUT_NAME\[layout\]/, 'and its name says which shape');
  assert.match(pager, /class: `btn shape shape-\$\{layout\}`/);
  const style = readFileSync('src/renderer/styles/app.css', 'utf8');
  for (const shape of ['list', 'grid', 'board']) {
    assert.match(style, new RegExp(`\\.btn\\.shape-${shape}::before`), `${shape} needs an icon`);
  }
  const css = readFileSync('src/renderer/styles/app.css', 'utf8');
  assert.match(css, /\.rolegrid \.rowpanel \{[^}]*grid-column: 1 \/ -1/,
    'editing under a card should span the grid rather than squeezing one column');
});

test('the board has columns a role can be moved into, which is what makes it a board', () => {
  const pipeline = readFileSync('src/renderer/views/pipeline.ts', 'utf8');
  assert.match(pipeline, /on\(column, 'drop'/, 'a column should be somewhere a card can land');
  assert.match(pipeline, /draggable: 'true'/);
  // Dragging is not the only way in.
  assert.match(pipeline, /`→ \$\{LABELS\(advance\)\}`/, 'a card should carry the move as a press too');
  // Reaching applied is asked about wherever it happens from -- the board turned the
  // one move the gate stands in front of into a single drag.
  assert.match(pipeline, /if \(to === 'applied'\) \{ askSend/);
});

test('a board column is capped, because a board is for the shape of the whole thing', () => {
  const pipeline = readFileSync('src/renderer/views/pipeline.ts', 'utf8');
  assert.match(pipeline, /const COLUMN_CAP = \d+;/);
  assert.match(pipeline, /inStage\.length - COLUMN_CAP/, 'and says how many it held back');
});

test('applications are split by where they got to', () => {
  const applications = readFileSync('src/renderer/views/applications.ts', 'utf8');
  assert.match(applications, /sections\(\{/, 'one list of 150 is not three answers');
  assert.match(applications, /waiting: rows\.filter/);
  assert.match(applications, /heard: rows\.filter/);
  assert.match(applications, /ended: rows\.filter/);
});

test('a chunked list says how many are left, not just that there are more', () => {
  const chunk = readFileSync('src/renderer/components/chunk.ts', 'utf8');
  assert.match(chunk, /\$\{left\}/, 'the button should carry the number still hidden');
  assert.match(chunk, /All \$\{items\.length\} shown/, 'and say so when the list ends');
});

test('a calendar day shows a few and counts the rest', () => {
  const calendar = readFileSync('src/renderer/views/calendar.ts', 'utf8');
  // A cell that grows to fit everything made one month forty thousand pixels tall.
  assert.match(calendar, /const SHOWN = \d+;/, 'a day should cap what it draws');
  assert.match(calendar, /\$\{rest\} more/, 'and say how many it held back');
});

test('opening a role opens the stage that holds it', () => {
  const pipeline = readFileSync('src/renderer/views/pipeline.ts', 'utf8');
  // Landing on the pipeline is not landing on the role, and with tabs the role can be
  // behind one that is not open.
  assert.match(pipeline, /focusedRole\(\)/, 'the pipeline should know what a jump was aimed at');
  assert.match(pipeline, /holding \?\?/, 'and open on the stage that holds it');
});
