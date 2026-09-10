import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLibrary, importPack, readYourFeeds, writeYourFeeds, removePack, YOUR_FEEDS,
} from '../../dist/main/sources/library.js';
import { PackRejected } from '../../dist/main/sources/pack.js';
import { loadFamilies, saveFamilies, resetFamilies } from '../../dist/main/setup/defaults.js';

const SHIPPED = 'defaults/sources.json';

const FEED = {
  id: 'example-feed', label: 'Example Feed', kind: 'aggregator', docs: 'https://example.test',
  endpoint: 'https://example.test/api?q={query}',
  fields: { company: 'employer', role: 'title' },
};

function inTemp(run) {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-lib-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('a feed written in the app comes back the way it went in', () => {
  inTemp((dir) => {
    writeYourFeeds(dir, [FEED]);
    const back = readYourFeeds(dir);
    assert.equal(back.length, 1);
    assert.equal(back[0].id, 'example-feed');
    assert.equal(back[0].endpoint, FEED.endpoint);
  });
});

test('a feed written in the app is judged by the reader that judges a file', () => {
  // One standard for both, or the form becomes a way round the rules the file obeys.
  inTemp((dir) => {
    assert.throws(() => writeYourFeeds(dir, [{ ...FEED, endpoint: 'http://example.test?q={query}' }]), PackRejected);
    assert.equal(existsSync(join(dir, YOUR_FEEDS)), false, 'a refused feed was still written');
  });
});

test('your own file is read last, so your version of a shipped feed wins', () => {
  inTemp((dir) => {
    writeFileSync(join(dir, 'a-pack.json'), JSON.stringify({ sources: [FEED] }));
    writeYourFeeds(dir, [FEED]);
    const library = loadLibrary(SHIPPED, dir);
    const origins = library.entries.filter((e) => e.definition.id === 'example-feed').map((e) => e.origin);
    assert.deepEqual(origins, ['a-pack.json', YOUR_FEEDS]);
    assert.ok(library.entries.every((e) => e.origin !== 'sources.json' || e.shipped));
  });
});

test('a file that is not a pack is named rather than taking the good ones down', () => {
  inTemp((dir) => {
    writeFileSync(join(dir, 'broken.json'), 'not json at all');
    const library = loadLibrary(SHIPPED, dir);
    assert.ok(library.entries.length > 0, 'one bad file emptied the whole library');
    assert.ok(library.problems.some((one) => one.includes('broken.json')));
  });
});

test('an imported file is refused before a copy is kept', () => {
  // A file that lands in the folder and fails at the next startup is a feed that
  // disappears without a word.
  inTemp((dir) => {
    const packs = join(dir, 'packs');
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ sources: [{ ...FEED, endpoint: 'https://example.test/api' }] }));
    assert.throws(() => importPack(packs, bad), PackRejected);
    assert.deepEqual(existsSync(packs) ? readdirSync(packs) : [], []);
  });
});

test('removing a pack only ever reaches a file in your own folder', () => {
  inTemp((dir) => {
    const packs = join(dir, 'packs');
    mkdirSync(packs, { recursive: true });
    writeFileSync(join(dir, 'outside.json'), JSON.stringify({ sources: [FEED] }));
    writeFileSync(join(packs, 'mine.json'), JSON.stringify({ sources: [FEED] }));

    assert.equal(removePack(packs, '../outside.json'), false);
    assert.ok(existsSync(join(dir, 'outside.json')), 'a name climbed out of the folder');
    assert.equal(removePack(packs, 'mine.json'), true);
    assert.equal(existsSync(join(packs, 'mine.json')), false);
  });
});

test('families you edit replace the shipped ones by id and leave the rest', () => {
  inTemp((dir) => {
    const file = join(dir, 'families.json');
    const shipped = loadFamilies(null).families;
    const one = shipped[0];

    saveFamilies(file, [{ id: one.id, label: 'Mine', titles: ['A Title'] }], false);
    const merged = loadFamilies(file);
    assert.equal(merged.families.length, shipped.length, 'a replacement added a family instead');
    assert.deepEqual(merged.families.find((f) => f.id === one.id).titles, ['A Title']);
    assert.deepEqual(merged.yours, [one.id]);
    assert.equal(merged.problem, null);
  });
});

test('once your own list is the one you use, the sample can go entirely', () => {
  inTemp((dir) => {
    const file = join(dir, 'families.json');
    saveFamilies(file, [{ id: 'mine', label: 'Mine', titles: ['A Title'] }], true);
    const only = loadFamilies(file);
    assert.deepEqual(only.families.map((f) => f.id), ['mine']);
    assert.equal(only.replaceShipped, true);

    resetFamilies(file);
    assert.ok(loadFamilies(file).families.length > 1, 'the sample did not come back');
  });
});

test('an edit cannot leave nothing to search for', () => {
  inTemp((dir) => {
    const file = join(dir, 'families.json');
    // A family with no titles is a chip that does nothing and a slot in every run.
    saveFamilies(file, [{ id: 'mine', label: 'Mine', titles: ['A Title'] }, { id: 'empty', label: 'Empty', titles: [] }], true);
    assert.deepEqual(loadFamilies(file).families.map((f) => f.id), ['mine']);
    assert.throws(() => saveFamilies(file, [], true), /nothing to search for/);
  });
});

test('a families file that has been broken by hand leaves the sample in place and says so', () => {
  inTemp((dir) => {
    const file = join(dir, 'families.json');
    writeFileSync(file, '{ not json');
    const loaded = loadFamilies(file);
    assert.ok(loaded.families.length > 1);
    assert.match(loaded.problem, /not valid JSON/);
  });
});
