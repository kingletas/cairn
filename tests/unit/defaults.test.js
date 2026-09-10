import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (name) => JSON.parse(readFileSync(`defaults/${name}`, 'utf8'));

/** Cairn ships with knowledge, never with a person. Anything here that described
 *  somebody would be published to everyone who installs it. */
test('nothing shipped describes a person', () => {
  const settings = read('settings.json').settings;
  assert.deepEqual(settings.excludedEmployers, [], 'an exclusion list names employers somebody avoided');
  assert.equal(settings.harvestCadenceHours, null, 'nothing is fetched until the user asks');
  for (const intent of read('questions.json').intents) {
    assert.ok(!('answer' in intent), `${intent.id} ships an answer, and an answer describes a person`);
    assert.ok(intent.terms.length > 0, `${intent.id} recognises no wording`);
  }
  // Boards are suggested, never added: the file offers a starting point and the vault
  // stays empty until somebody presses a button. What must never ship is a board
  // already being watched, because that is a statement about a person.
  const boards = read('boards.json');
  assert.deepEqual(boards.examples, [], 'a board list here would be one somebody was watching');
  for (const one of boards.suggested ?? []) {
    assert.ok(!('addedAt' in one), `${one.token} ships as though somebody had added it`);
    assert.ok(one.sourceId && one.token && one.company, `${one.token} is missing a field`);
  }
});

test('no shipped feed can arrive switched on', () => {
  // Whether Cairn fetches from somewhere is a row in the vault that a person set.
  // A file that could turn a feed on would make the request count somebody else's.
  for (const source of read('sources.json').sources) {
    assert.equal('enabled' in source, false, `${source.id} tries to switch itself on`);
  }
});

test('the shipped pack carries no credential and nowhere to put one', () => {
  // This file is meant to be copied, edited and shared. A key in one gets mailed,
  // pasted into an issue and committed to somebody else's repository.
  const body = readFileSync('defaults/sources.json', 'utf8');
  assert.doesNotMatch(body, /"(apiKey|api_key|token|secret|password|authorization|headers)"/i);
});

test('every shipped feed is reachable over https and says which fields it means', () => {
  for (const source of read('sources.json').sources) {
    assert.match(source.endpoint, /^https:\/\//, `${source.id} would fetch in the clear`);
    assert.ok(source.endpoint.includes('{query}') || source.searchless === true,
      `${source.id} takes no search term and does not say it is searchless`);
    assert.ok(source.fields.company && source.fields.role, `${source.id} has no field map`);
  }
});

test('nothing shipped points at a machine somebody happened to be on', () => {
  // Cairn is a tool other people install. A host that only resolves here, or a path
  // out of somebody's home directory, is this laptop leaking into a release.
  const body = readFileSync('defaults/sources.json', 'utf8')
    + readFileSync('defaults/families.json', 'utf8');
  assert.doesNotMatch(body, /localhost|127\.0\.0\.1|\.test\/|\/home\/|\/Users\//);
});

test('the shipped taxonomy is broad rather than one person\'s lane', () => {
  // A sample is a starting point for anybody. A short list of closely related titles
  // is somebody's own search, which is not this file's to carry -- yours goes in
  // families.json in your vault, where it is never in this repository.
  const families = read('families.json').families;
  assert.ok(families.length >= 12, 'a handful of families describes one search, not a starting point');
  const engineering = families.filter((f) =>
    f.titles.some((t) => /engineer/i.test(t))).length;
  assert.ok(engineering < families.length * 0.75, 'this reads as one person\'s field rather than a taxonomy');
  for (const family of families) assert.ok(family.titles.length > 0, family.id);
});

test('every template is a skeleton with nothing filled in', () => {
  for (const kind of ['resume', 'cover-letter']) {
    const files = readdirSync(`defaults/templates/${kind}`);
    assert.ok(files.length > 0, kind);
    for (const file of files) {
      const body = readFileSync(`defaults/templates/${kind}/${file}`, 'utf8');
      assert.match(body, /\{\{/, `${file} has no placeholders, so something is filled in`);
      assert.doesNotMatch(body, /@[a-z0-9.-]+\.[a-z]{2,}/i, `${file} carries an email address`);
    }
  }
});

test('every suggested board names a source Cairn can actually poll', async () => {
  // A suggestion for an adapter that does not exist is a button that fails, and the
  // token is what the request is built from, so a typo is a request to nowhere.
  const { adapters } = await import('../../dist/main/sources/index.js');
  const ats = new Set(adapters().filter((one) => one.kind === 'ats').map((one) => one.id));
  for (const one of read('boards.json').suggested) {
    assert.ok(ats.has(one.sourceId), `${one.company} names ${one.sourceId}, which polls no board`);
    assert.match(one.token, /^[A-Za-z0-9_-]+$/, `${one.company} has a token that cannot go in a URL`);
  }
});

test('the suggested boards cover every board adapter that ships', () => {
  // One with none is a lane that can be switched on and can never run, which is the
  // dead end this list exists to remove.
  const covered = new Set(read('boards.json').suggested.map((one) => one.sourceId));
  for (const id of ['greenhouse', 'lever', 'ashby', 'smartrecruiters']) {
    assert.ok(covered.has(id), `${id} can be turned on and has no board to poll`);
  }
});
