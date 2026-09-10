import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { t, useLanguage, covered } = await import('../../dist/renderer/i18n.js');
const { closestTo } = await import('../../dist/main/setup/locale.js');

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const shipped = read('defaults/lang/phrases.json');
const source = shipped.phrases;
const catalogues = readdirSync('defaults/lang')
  .filter((f) => f.endsWith('.json') && f !== 'phrases.json');

test('the shipped phrase list is in step with the source', () => {
  // A catalogue is written against this list. Out of step, a translator works from
  // phrases the app no longer shows and misses the ones it does.
  const dir = mkdtempSync(join(tmpdir(), 'cairn-phrases-'));
  const out = join(dir, 'phrases.json');
  try {
    execFileSync('node', ['scripts/extract-phrases.mjs', out], { encoding: 'utf8' });
    assert.deepEqual(read(out), shipped, 'run `npm run phrases` — the interface has phrases the list does not');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an escape in the source is one character in the list', () => {
  // A ’ written as an escape is a curly apostrophe at runtime. Left as written, the
  // key is one no catalogue could ever match, and the phrase silently stays English.
  assert.equal(source.some((one) => one.includes('\\u')), false,
    'these carry an escape sequence rather than the character it stands for');
});

test('every catalogue translates phrases the interface actually has', () => {
  for (const file of catalogues) {
    const { name, phrases } = read(join('defaults/lang', file));
    assert.ok(typeof name === 'string' && name !== '', `${file} does not say what it is called`);
    const known = new Set(source);
    const dead = Object.keys(phrases).filter((one) => !known.has(one));
    assert.deepEqual(dead, [], `${file} carries phrases the interface never shows`);
  }
});

test('a fragment keeps the spacing that joins it to its neighbours', () => {
  // Several sentences are assembled from pieces, and the leading or trailing space is
  // part of the phrase. Trim one in a catalogue and two words run together on screen.
  for (const file of catalogues) {
    const { phrases } = read(join('defaults/lang', file));
    const ran = [];
    for (const [english, said] of Object.entries(phrases)) {
      if (said.trim() === '') continue;
      if (english.startsWith(' ') !== said.startsWith(' ')) ran.push(`${file}: leading — ${english.slice(0, 40)}`);
      if (english.endsWith(' ') !== said.endsWith(' ')) ran.push(`${file}: trailing — ${english.slice(0, 40)}`);
    }
    assert.deepEqual(ran, [], 'these would run two words together, or split one');
  }
});

test('a phrase with no translation shows the English it was written in', () => {
  useLanguage('xx', { 'Lock vault': 'Cerrar la bóveda' });
  assert.equal(t('Lock vault'), 'Cerrar la bóveda');
  assert.equal(t('Nothing is due'), 'Nothing is due', 'a missing phrase must never be a key or a blank');
  useLanguage('xx', { 'Lock vault': '   ' });
  assert.equal(t('Lock vault'), 'Lock vault', 'an empty entry is a missing one, not an empty screen');
  useLanguage('en', {});
  assert.equal(t('Lock vault'), 'Lock vault');
});

test('coverage is measured, not claimed', () => {
  assert.equal(covered({ a: 'x', b: 'y' }, 4), 50);
  assert.equal(covered({ a: 'x', b: '  ' }, 4), 25, 'an empty entry covers nothing');
  assert.equal(covered({}, 0), 0, 'nothing to cover is not full coverage');
});

test('Spanish covers the whole interface', () => {
  const { phrases } = read('defaults/lang/es.json');
  assert.equal(covered(phrases, source.length), 100,
    'the panel reports this figure, so it has to be the real one');
});

test('only the attributes somebody reads are translated', () => {
  // A class or a data key going through the catalogue would rename it and break the
  // stylesheet, and it would put a class name in front of a translator.
  const dom = readFileSync('src/renderer/components/dom.ts', 'utf8');
  assert.match(dom, /SPOKEN = new Set\(\['aria-label', 'title', 'placeholder', 'alt'\]\)/);
  assert.match(dom, /SPOKEN\.has\(key\) \? t\(String\(value\)\) : String\(value\)/);
  assert.match(dom, /document\.createTextNode\(t\(child\)\)/,
    'text reaching the DOM has to go through the catalogue, or nothing is translated');
});

test('a catalogue that will not parse is one language missing, not a broken app', async () => {
  const languages = readFileSync('src/main/setup/languages.ts', 'utf8');
  assert.match(languages, /catch \{[\s\S]{0,200}return null;/, 'a bad file must not take the app down');
  assert.match(languages, /if \(code === 'en'\) return \{\};/, 'English is the source, so there is nothing to look up');
});

test('a language of your own is laid over the shipped one', () => {
  // So changing a single line does not mean carrying a copy of the whole catalogue.
  const languages = readFileSync('src/main/setup/languages.ts', 'utf8');
  const order = /for \(const dir of \[shippedDir\(\), languagesDir\(\)\]\)/.exec(languages);
  assert.ok(order !== null, 'yours has to be read after the shipped one, or it cannot win');
});

test('the phrase list ships, so a translator has the source', () => {
  const files = readdirSync('defaults/lang');
  assert.ok(files.includes('phrases.json'), 'without it somebody has to find the strings themselves');
  assert.ok(source.length > 400, 'the list looks wrong');
});

test('a sentence built around a number is translated too', () => {
  // The string is different every time it is shown, so there is nothing to look up. The
  // catalogue carries the shape instead, and the values are put back after the lookup.
  useLanguage('xx', { '{0} roles, newest first.': '{0} puestos, el más reciente primero.' });
  assert.equal(t('7 roles, newest first.'), '7 puestos, el más reciente primero.');
  assert.equal(t('1 role, newest first.'), '1 role, newest first.', 'a shape it does not carry stays English');
});

test('a translation may put the values in its own order', () => {
  useLanguage('xx', { 'Details for {0} at {1}': 'Détails de {1} : {0}' });
  assert.equal(t('Details for Staff Engineer at Northwind'), 'Détails de Northwind : Staff Engineer');
});

test('a shape that loses or invents a value is left alone', () => {
  // Filling {2} from a sentence with two values writes {2} onto the screen, and dropping
  // {1} takes a number off it. Neither is better than the English it was written in.
  useLanguage('xx', { '{0} in, {1} out · {2}': '{0} dentro' });
  assert.equal(t('3 in, 4 out · kept'), '3 in, 4 out · kept');
  useLanguage('xx', { '{0} in, {1} out · {2}': '{0} dentro, {1} fuera · {2} · {3}' });
  assert.equal(t('3 in, 4 out · kept'), '3 in, 4 out · kept');
});

test('the shape that recognises most of a sentence is the one used', () => {
  // 'Sent with {0}.' matches the whole of the longer sentence, so on its own it would
  // swallow the ending and translate half of it.
  useLanguage('xx', {
    'Sent with {0}.': 'Enviada con {0}.',
    'Sent with {0} — an earlier version of it.': 'Enviada con {0} — una versión anterior.',
  });
  assert.equal(t('Sent with CV.pdf — an earlier version of it.'), 'Enviada con CV.pdf — una versión anterior.');
  assert.equal(t('Sent with CV.pdf.'), 'Enviada con CV.pdf.');
});

test('every sentence the interface shows can be written as a phrase', () => {
  // One that cannot is counted rather than left out: a coverage figure that ignores it
  // is a false one, and the panel says so on the screen.
  assert.equal(shipped.notYet, 0, 'run `npm run phrases` — these stay English in every language');
  const panel = readFileSync('src/renderer/views/settings.ts', 'utf8');
  assert.match(panel, /phrasesBuiltAroundAValue\(\)/, 'the panel has to show it');
  assert.match(panel, /stay English in every language/, 'and say what it means');
});

test('a shape is filled with the same values in every catalogue', () => {
  // A translation that drops one loses a number off the screen, and one that invents a
  // slot leaves {2} sitting in the sentence.
  const wrong = [];
  for (const file of catalogues) {
    const { phrases } = read(join('defaults/lang', file));
    for (const [english, said] of Object.entries(phrases)) {
      if (said.trim() === '') continue;
      const mine = [...new Set([...english.matchAll(/\{(\d)\}/g)].map((one) => one[1]))].sort();
      const theirs = [...new Set([...said.matchAll(/\{(\d)\}/g)].map((one) => one[1]))].sort();
      if (mine.join() !== theirs.join()) wrong.push(`${file}: ${english.slice(0, 50)}`);
    }
  }
  assert.deepEqual(wrong, [], 'these would show the wrong values, or a slot instead of one');
});

test('Spanish fills a sentence built around a number', () => {
  const { phrases } = read('defaults/lang/es.json');
  useLanguage('es', phrases);
  assert.equal(t('3 roles, newest first.'), '3 puestos, el más reciente primero.');
  assert.equal(t('Move to Applied'), 'Mover a Applied', 'the value is passed through, not looked up');
  useLanguage('en', {});
});

test('no phrase reaches the screen around el()', () => {
  // el() is where translation happens, so prose handed to append() any other way reaches
  // the DOM in English whatever the language. words() is the way out for an element a
  // view already holds, and translates the same.
  const around = [];
  for (const file of readdirSync('src/renderer/views')) {
    if (!file.endsWith('.ts')) continue;
    const body = readFileSync(join('src/renderer/views', file), 'utf8');
    // Where a literal opens in the argument itself rather than inside a call it makes.
    // One handed to a helper is translated there; one the argument holds is not.
    const opened = [];
    for (const at of [...body.matchAll(/\.append\(/g)].map((m) => m.index + m[0].length)) {
      let depth = 0;
      for (let i = at; i < body.length; i += 1) {
        const ch = body[i];
        if (ch === "'" || ch === '"' || ch === '`') {
          if (depth === 0) opened.push(i);
          for (i += 1; i < body.length; i += 1) {
            if (body[i] === '\\') { i += 1; continue; }
            if (body[i] === ch) break;
          }
          continue;
        }
        if ('([{'.includes(ch)) { depth += 1; continue; }
        if (ch === ')' && depth === 0) break;
        if (')]}'.includes(ch)) { depth -= 1; continue; }
      }
    }
    for (const at of opened) {
      const prose = /^['`]([^'`\n]{3,})['`]/.exec(body.slice(at));
      if (prose !== null && /[a-z] [a-z]/.test(prose[1])) around.push(`${file}: ${prose[1].slice(0, 40)}`);
    }
  }
  assert.deepEqual(around, [], 'these reach the DOM without being translated');
});

test('a locked vault follows the language the machine is set to', () => {
  // The setting lives in the vault, so the first screen anybody sees had no language to
  // read and was English whatever they had chosen.
  const have = ['en', 'es', 'fr', 'pt'];
  assert.equal(closestTo('fr', have), 'fr');
  assert.equal(closestTo('pt-BR', have), 'pt', 'a near language beats no language');
  assert.equal(closestTo('es_MX', have), 'es', 'an underscore is the same locale');
  assert.equal(closestTo('FR-ca', have), 'fr', 'case is not part of a locale');
  assert.equal(closestTo('de', have), 'en', 'nothing close is English, never a blank screen');
  assert.equal(closestTo('', have), 'en');
  assert.equal(closestTo('fr', []), 'en', 'no catalogues at all is still a screen');
});

test('an exact catalogue wins over its language', () => {
  assert.equal(closestTo('pt-BR', ['en', 'pt', 'pt-BR']), 'pt-BR');
  assert.equal(closestTo('pt-PT', ['en', 'pt', 'pt-BR']), 'pt', 'the first of its language, not a wrong region');
});

test('the lock screen is drawn after the language is chosen', () => {
  // Drawn first, it would be English for the length of a frame and then swap.
  const boot = readFileSync('src/renderer/app.ts', 'utf8');
  const asked = boot.indexOf('language.phrases()');
  const drawn = boot.indexOf('renderLock(');
  assert.ok(asked > 0 && drawn > asked, 'the phrases have to be in hand before anything is drawn');
});

test('a locked vault reads the machine locale, not English', () => {
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.match(handlers, /!vault\.isUnlocked[\s\S]{0,200}closestTo\(app\.getLocale\(\)/,
    'a locked vault has to fall back to the machine, or the first screen is always English');
});
