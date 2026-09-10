import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pager = readFileSync('src/renderer/components/paged.ts', 'utf8');
const pipeline = readFileSync('src/renderer/views/pipeline.ts', 'utf8');
const css = readFileSync('src/renderer/styles/app.css', 'utf8');

test('the bar does not say what it is standing on', () => {
  // "1-20 of 57 roles" on the pipeline, "Page 1 of 3" on a paging bar: both said twice.
  assert.doesNotMatch(pager, /Page \$\{page\.at \+ 1\}/);
  assert.match(pager, /\$\{page\.at \+ 1\} \/ \$\{pages\}/);
  // A noun is back, but only where it says something the screen does not: "of 132 out
  // of step" on a screen of findings, never "of 154 roles" on a screen of roles.
  assert.match(pager, /options\.noun \? ` \$\{options\.noun\}` : ''/);
  const pipeline = readFileSync('src/renderer/views/pipeline.ts', 'utf8');
  assert.doesNotMatch(pipeline, /noun: 'roles'/, 'the pipeline is a list of roles and says so already');
});

test('previous and next are a direction, drawn', () => {
  assert.match(pager, /class: 'btn step step-back'/);
  assert.match(pager, /class: 'btn step step-on'/);
  assert.match(pager, /'aria-label': 'Previous'/, 'and named for anybody who cannot see it');
  for (const part of ['step-back', 'step-on']) {
    assert.ok(css.includes(`.btn.${part}::before`), `${part} needs a shape`);
  }
});

test('the count is at the left and the controls at the right', () => {
  // Without a lead the whole bar was shoved to the right edge, which is what made it
  // read as unrelated to the table under it.
  assert.match(css, /\.pagebar \.controls \{ margin-left: auto; \}/);
  assert.doesNotMatch(css, /\.pagecount \{ margin-left: auto/);
});

test('a stage filter has a way out of itself', () => {
  // Every tab is a filter, and the board was the only thing that showed everything.
  assert.match(pipeline, /id: 'all' as Stage \| 'aside' \| 'all'/);
  assert.match(pipeline, /label: `All \$\{opportunities\.length\}`/);
});

test('pressing a role closes the posting it opened', () => {
  // A control that only opens needs a second one to undo it, which was a Close button
  // doing what the row could already do.
  assert.match(pipeline, /const mine = showing\?\.classList\.contains\('posting'\)/);
  assert.match(pipeline, /if \(mine\) return;/);
  assert.doesNotMatch(pipeline, /'Close'\)/, 'the panel should not carry its own close');
});

test('the posting link is a link', () => {
  assert.match(pipeline, /el\('a', \{ class: 'exlink', href: o\.url/);
  // It opens in a browser, and the window never navigates itself.
  assert.match(pipeline, /event\.preventDefault\(\);[\s\S]{0,120}open\.external/);
});
