import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pipeline = readFileSync('src/renderer/views/pipeline.ts', 'utf8');
const css = readFileSync('src/renderer/styles/app.css', 'utf8');

test('a jump asking for one role does not land on the board', () => {
  // The board draws five cards a column, so the role asked for is usually not on it --
  // and a board is a place you choose to be rather than somewhere to be dropped.
  assert.match(pipeline, /if \(settings\.pipelineLayout === 'board' && wanted === null\)/);
});

test('choosing the board is not undone by a jump', () => {
  // The drawing changes; the setting does not.
  const board = /if \(settings\.pipelineLayout === 'board' && wanted === null\)[\s\S]{0,320}/.exec(pipeline);
  assert.ok(board !== null);
  assert.doesNotMatch(board[0], /settings\.set\('pipelineLayout'/);
});

test('a lead card has room to be a card', () => {
  // Squeezed into a three-hundred-pixel column its header collapsed on top of itself.
  assert.match(css, /\.rolegrid\.leads \{/);
  assert.match(css, /\.rolegrid\.leads \{\n {2}grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, \d+px\), 1fr\)\);/);
  assert.match(css, /\.rolegrid\.leads \.reqtoggle \{\n {2}flex-direction: column/);
});
