/** Every phrase the interface can show, pulled out of the source so a catalogue can be
 *  written against it. A phrase is a string that reaches a person: passed to el() as a
 *  child, or as one of the attributes somebody reads. */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/** Prose rather than a class name, an id, a path or a token. Judged on the trimmed
 *  value: several of these arrive with a leading space, from a class built by hand. */
const STOPWORD = / (a|an|the|to|of|is|are|was|in|on|at|for|and|or|you|your|it|no|not|has|have|this|that|what|when|with|from|so|by|be|will|can|cannot|never|every|one|somebody|nothing|anything) /i;

function isPhrase(raw) {
  const value = raw.trim();
  if (value.length < 3) return false;
  if (/^[\s\W\d]+$/.test(value)) return false;
  if (/^(https?:|data:|\.{1,2}\/|\/|#|--)/.test(value)) return false;
  if (/\.(ts|js|mjs|json|css|html|md|pdf|png)$/.test(value)) return false;
  // A single lowercase token is an identifier, a class or a dataset key. A capitalised
  // one is a label somebody reads: Today, Leads, Keep, Settings. Dropping every single
  // word left the whole navigation rail in English.
  if (!value.includes(' ') && !/^[A-Z]/.test(value)) return false;
  // A class list or a selector: lowercase words, no sentence shape, no punctuation.
  if (/^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/.test(value) && !STOPWORD.test(` ${value} `)) {
    return false;
  }
  return /[A-Za-z]{2}/.test(value);
}

/** What the source writes as an escape is one character on screen. Left as written, the
 *  shipped list carries a key no catalogue could ever match. */
function plain(raw) {
  return raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\`/g, '`')
    .replace(/\\\$/g, '$')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

function endOfString(text, at) {
  const quote = text[at];
  for (let i = at + 1; i < text.length; i += 1) {
    if (text[i] === '\\') { i += 1; continue; }
    if (text[i] === quote) return i + 1;
  }
  return text.length;
}

/** A hole runs to its own closing brace, past any string or template inside it. */
function endOfHole(text, at, shut = '}') {
  const open = shut === '}' ? '{' : '(';
  let depth = 0;
  let i = at;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"') { i = endOfString(text, i); continue; }
    if (ch === '`') { i = readTemplate(text, i).end; continue; }
    if (ch === open) { depth += 1; i += 1; continue; }
    if (ch === shut) { if (depth === 0) return i; depth -= 1; i += 1; continue; }
    i += 1;
  }
  return text.length;
}

function readTemplate(text, at) {
  const parts = [''];
  const holes = [];
  let i = at + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') { parts[parts.length - 1] += ch + (text[i + 1] ?? ''); i += 2; continue; }
    if (ch === '`') return { parts, holes, end: i + 1 };
    if (ch === '$' && text[i + 1] === '{') {
      const shut = endOfHole(text, i + 2);
      holes.push(text.slice(i + 2, shut));
      parts.push('');
      i = shut + 1;
      continue;
    }
    parts[parts.length - 1] += ch;
    i += 1;
  }
  return { parts, holes, end: text.length };
}

/** `a` + `b` is one sentence by the time it reaches the screen. Read as two, a plural
 *  and the words after it become separate keys and no language can reorder them. */
function joinedTemplate(text, at) {
  let one = readTemplate(text, at);
  for (;;) {
    const plus = /^\s*\+\s*/.exec(text.slice(one.end));
    if (plus === null) return one;
    const next = one.end + plus[0].length;
    const ch = text[next];
    const tail = one.parts[one.parts.length - 1];
    if (ch === '`') {
      const more = readTemplate(text, next);
      one = {
        parts: [...one.parts.slice(0, -1), tail + more.parts[0], ...more.parts.slice(1)],
        holes: [...one.holes, ...more.holes],
        end: more.end,
      };
      continue;
    }
    if (ch === "'" || ch === '"') {
      const shut = endOfString(text, next);
      one = { parts: [...one.parts.slice(0, -1), tail + text.slice(next + 1, shut - 1)], holes: one.holes, end: shut };
      continue;
    }
    // `+ (yes ? 'a' : 'b')` is the same choice between two words written outside the
    // template. Read as the end of the sentence, the key is a prefix of what the screen
    // shows and matches nothing.
    if (ch === '(') {
      const shut = endOfHole(text, next + 1, ')');
      one = { parts: [...one.parts, ''], holes: [...one.holes, text.slice(next + 1, shut)], end: shut + 1 };
      continue;
    }
    return one;
  }
}

/** Template literals, holes kept apart from words. A regex cannot do this: a template
 *  nested inside a hole closes the outer one, and the sentence is cut in half. */
function templates(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') { const stop = text.indexOf('\n', i); if (stop < 0) break; i = stop; continue; }
    if (ch === '/' && text[i + 1] === '*') { const stop = text.indexOf('*/', i); if (stop < 0) break; i = stop + 2; continue; }
    if (ch === "'" || ch === '"') {
      const shut = endOfString(text, i);
      const plus = /^\s*\+\s*/.exec(text.slice(shut));
      // `'a ' + \`b ${c}\`` is one string on the screen, and the words before the first
      // hole are in the quoted half. Read from the backtick alone, the key is the tail of
      // the sentence and matches nothing.
      if (plus !== null && text[shut + plus[0].length] === '`') {
        const one = joinedTemplate(text, shut + plus[0].length);
        const whole = {
          parts: [text.slice(i + 1, shut - 1) + one.parts[0], ...one.parts.slice(1)],
          holes: one.holes,
          end: one.end,
        };
        out.push(whole);
        for (const hole of whole.holes) out.push(...templates(hole));
        i = whole.end;
        continue;
      }
      i = shut;
      continue;
    }
    if (ch === '`') {
      const one = joinedTemplate(text, i);
      out.push(one);
      for (const hole of one.holes) out.push(...templates(hole));
      i = one.end;
      continue;
    }
    i += 1;
  }
  return out;
}

/** `${n === 1 ? 'role' : 'roles'}` is not a value, it is a choice between two words.
 *  Written as a slot, the chosen word is captured in English and put back untranslated,
 *  so a sentence reads as French around an English plural. */
function sideOf(text) {
  const value = text.trim();
  if (value.startsWith('`')) {
    const one = readTemplate(value, 0);
    return one.end === value.length ? one : null;
  }
  if (value.startsWith("'") || value.startsWith('"')) {
    return endOfString(value, 0) === value.length ? { parts: [value.slice(1, -1)], holes: [] } : null;
  }
  return null;
}

/** The two things a hole can put on the screen, when both of them are words rather than
 *  values. Anything else is a value, and gets a slot. */
function branchesOf(hole) {
  let depth = 0;
  let ask = -1;
  for (let i = 0; i < hole.length; i += 1) {
    const ch = hole[i];
    if (ch === "'" || ch === '"') { i = endOfString(hole, i) - 1; continue; }
    if (ch === '`') { i = readTemplate(hole, i).end - 1; continue; }
    if ('([{'.includes(ch)) { depth += 1; continue; }
    if (')]}'.includes(ch)) { depth -= 1; continue; }
    if (ch === '?' && depth === 0) {
      if (hole[i + 1] === '?' || hole[i + 1] === '.') { i += 1; continue; }
      ask = i;
      break;
    }
  }
  if (ask < 0) return null;
  depth = 0;
  for (let i = ask + 1; i < hole.length; i += 1) {
    const ch = hole[i];
    if (ch === "'" || ch === '"') { i = endOfString(hole, i) - 1; continue; }
    if (ch === '`') { i = readTemplate(hole, i).end - 1; continue; }
    if ('([{'.includes(ch)) { depth += 1; continue; }
    if (')]}'.includes(ch)) { depth -= 1; continue; }
    if (ch === ':' && depth === 0) {
      const yes = sideOf(hole.slice(ask + 1, i));
      const no = sideOf(hole.slice(i + 1));
      return yes === null || no === null ? null : [yes, no];
    }
  }
  return null;
}

const SPREAD = 8;

/** The sentence with its values written as numbered slots, so one catalogue entry covers
 *  every value it is shown with. Numbered rather than bare, so a translation can put them
 *  in the order its own language needs. */
function expandInto(candidates, one) {
  let made = candidates.map((sofar) => ({ text: sofar.text + plain(one.parts[0]), slot: sofar.slot }));
  one.holes.forEach((hole, i) => {
    const branches = branchesOf(hole);
    let next = [];
    if (branches !== null) for (const branch of branches) next.push(...expandInto(made, branch));
    if (branches === null || next.length > SPREAD) {
      next = made.map((sofar) => ({ text: `${sofar.text}{${sofar.slot}}`, slot: sofar.slot + 1 }));
    }
    const after = plain(one.parts[i + 1]);
    made = next.map((sofar) => ({ text: sofar.text + after, slot: sofar.slot }));
  });
  return made;
}

function keysFor(one) {
  return [...new Set(expandInto([{ text: '', slot: 0 }], one).map((sofar) => sofar.text))];
}

/** A key is worth shipping when its own words are enough to recognise the sentence by.
 *  Two slots with nothing between them match anything, and so would swallow a company
 *  name or a role title on their way to the screen. */
function isPatternPhrase(key) {
  if (/\{\d\}\{\d\}/.test(key)) return false;
  if (/[[\]]|="|var\(--|https?:/.test(key)) return false;
  const bare = key.replace(/\{\d\}/g, ' ').replace(/\s+/g, ' ').trim();
  const words = bare.match(/[A-Za-z]{2,}/g) ?? [];
  return words.length >= 2 && isPhrase(bare);
}

/** Prose rather than a class, a selector or a stylesheet. */
function looksSpoken(one) {
  const bare = one.parts.join(' ');
  if (/var\(--/.test(bare)) return false;
  return (bare.match(/[A-Za-z]{2,}/g) ?? []).length >= 2;
}

/** `'a ' + 'b'` is one string by the time it reaches the screen, so the catalogue key is
 *  the joined sentence. Taken as two, both halves matched nothing and four paragraphs
 *  stayed English with every one of their pieces translated. */
function joinConcatenations(text) {
  const pair = /'((?:[^'\\\n]|\\.)*)'\s*\+\s*'((?:[^'\\\n]|\\.)*)'/g;
  let out = text;
  let before;
  do {
    before = out;
    out = out.replace(pair, (_, a, b) => `'${a}${b}'`);
  } while (out !== before);
  return out;
}

const found = new Map();
let notYet = 0;
for (const file of walk('src/renderer')) {
  const text = joinConcatenations(readFileSync(file, 'utf8'));
  const where = file.replace('src/renderer/', '');
  for (const one of templates(text)) {
    if (one.holes.length === 0 || !looksSpoken(one)) continue;
    const keys = keysFor(one).filter((key) => (/\{\d\}/.test(key) ? isPatternPhrase(key) : isPhrase(key)));
    if (keys.length === 0) { if (isPatternPhrase(keysFor(one)[0] ?? '') === false && /[A-Z]/.test(one.parts.join(''))) notYet += 1; continue; }
    for (const key of keys) found.set(key, where);
  }
  for (const [, raw] of text.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) {
    const value = plain(raw);
    if (isPhrase(value)) found.set(value, where);
  }
}

const phrases = [...found.keys()].sort((a, b) => a.localeCompare(b));
writeFileSync(process.argv[2] ?? 'phrases.json', `${JSON.stringify({ phrases, notYet }, null, 2)}\n`);
console.log(`${phrases.length} phrases, ${notYet} built around a value and not translatable yet`);
