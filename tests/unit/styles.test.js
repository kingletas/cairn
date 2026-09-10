import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const STYLES = 'src/renderer/styles';
const componentSheets = readdirSync(STYLES)
  .filter((f) => f.endsWith('.css') && f !== 'tokens.css' && f !== 'fonts.css')
  .map((f) => [f, readFileSync(join(STYLES, f), 'utf8')]);

/** A hardcoded colour is a theme that silently does not switch, and the only way to
 *  find one by looking is to open all four themes in both light and dark. So the
 *  build looks instead. */
test('no component stylesheet carries a colour literal', () => {
  for (const [name, css] of componentSheets) {
    const literals = css.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g) ?? [];
    assert.deepEqual(literals, [], `${name} carries ${literals.join(', ')}`);
  }
});

/** A bare pixel size does not scale, so the text-size setting would silently skip it. */
test('no component stylesheet carries a bare pixel type size', () => {
  for (const [name, css] of componentSheets) {
    const bare = (css.match(/font-size:\s*[0-9.]+px/g) ?? [])
      .concat(css.match(/font:\s*[^;{}]*?\b[0-9.]+px\s*\//g) ?? []);
    assert.deepEqual(bare, [], `${name} carries ${bare.join(', ')}`);
  }
});

/** Three radii are permitted and named in the tokens: --r, the pill, and round.
 *  A fourth is how a design system starts having two of everything.
 */
test('there is no fourth radius', () => {
  const allowed = new Set(['var(--r)', 'var(--r-pill)', 'var(--r-round)', '0']);
  for (const [name, css] of componentSheets) {
    const used = css.match(/border-radius:\s*([^;}]+)/g) ?? [];
    for (const declaration of used) {
      const value = declaration.replace(/border-radius:\s*/, '').trim();
      for (const part of value.split(/\s+/)) {
        assert.ok(allowed.has(part), `${name}: ${value} is not one of the three radii`);
      }
    }
  }
});

test('the radius check still refuses a real fourth radius', () => {
  // A check that cannot fail is not a check, and this one just had its rule widened.
  const allowed = new Set(['var(--r)', 'var(--r-pill)', 'var(--r-round)', '0']);
  for (const bad of ['9px', '0.5rem', '4px 4px 0 0', '50% 0']) {
    const parts = bad.split(/\s+/);
    assert.ok(parts.some((p) => !allowed.has(p)), `${bad} would now pass`);
  }
});

/** Sentence case throughout. An ALL-CAPS label is a shout, and this app has nothing
 *  to shout about.
 */
const LEGITIMATE_CAPITALS = new Set(['USD', 'GBP', 'EUR', 'CAD', 'AUD', 'CSV', 'JSON', 'PDF', 'URL']);

test('no interface string is written in capitals', () => {
  const views = readdirSync('src/renderer/views').map((f) => [f, readFileSync(join('src/renderer/views', f), 'utf8')]);
  for (const [name, source] of views) {
    const shouting = (source.match(/'[A-Z]{2,}[A-Z ]*'/g) ?? [])
      .map((quoted) => quoted.slice(1, -1))
      .filter((text) => !LEGITIMATE_CAPITALS.has(text));
    assert.deepEqual(shouting, [], `${name} carries ${shouting.join(', ')}`);
  }
});

test('the capitals allowlist is not a way to smuggle a shout in', () => {
  for (const word of LEGITIMATE_CAPITALS) {
    assert.ok(word.length <= 4, `${word} is too long to be an acronym`);
  }
});

test('the theme is one file, and the stylesheet says which', async () => {
  // Every colour, size and space in the app comes from here. Named for what it is and
  // shipped with the app, so somebody who wants a different one has the whole of it.
  const { readFileSync, existsSync } = await import('node:fs');
  assert.ok(existsSync('defaults/theme/cairn.json'), 'the theme should live with the other defaults');
  assert.ok(!existsSync('design'), 'the theme moved out of design/ and nothing should put it back');

  const theme = JSON.parse(readFileSync('defaults/theme/cairn.json', 'utf8'));
  assert.equal(theme.meta.name, 'Cairn');
  assert.match(theme.meta.note, /make theme/, 'the file should say how to rebuild from it');

  const css = readFileSync('src/renderer/styles/tokens.css', 'utf8');
  assert.match(css.split('\n')[0], /defaults\/theme\/cairn\.json/,
    'the generated stylesheet should name the file it came from');
});

test('the theme describes a look and never a person', async () => {
  // It ships inside the app like everything else under defaults/.
  const { readFileSync } = await import('node:fs');
  const body = readFileSync('defaults/theme/cairn.json', 'utf8');
  assert.doesNotMatch(body, /@|https?:\/\/|\/home\/|[Cc]:\\\\/, 'a theme is colours and sizes');
});

test('a segmented control is shared out among its options', async () => {
  // Sized by their own words, the options left the remainder inside the border, and
  // empty space between a border and a button reads as one more button nobody labelled.
  const { readFileSync } = await import('node:fs');
  const css = readFileSync('src/renderer/styles/app.css', 'utf8');
  assert.match(css, /\.seg button \{[^}]*flex: 1;/s, 'the options should share the control');
  assert.match(css, /\.frow > \.seg \{ flex: 0 0 auto; min-width: 320px; \}/,
    'a floor rather than a width: a fixed one cut the longest option off inside the border');
  assert.match(css, /\.frow \{[^}]*flex-wrap: wrap;/s,
    'with no room for both, a control goes under its label rather than off the panel');
  assert.match(css, /\.frow > div \{ flex: 1 1 0;/,
    'the description gives way first, or a control is a different width on every row');
});

test('the two buttons at the foot of the rail do not look like a pair', async () => {
  // One locks the vault and one changes what is on screen. Side by side in the same
  // colour they read as two halves of the same thing.
  const { readFileSync } = await import('node:fs');
  const css = readFileSync('src/renderer/styles/app.css', 'utf8');
  assert.match(css, /\.sharebtn \{[^}]*background: none;/s, 'off, it should be quieter than Lock vault');
  assert.match(css, /\.sharebtn\[aria-pressed="true"\] \{[^}]*--clay/s,
    'on, it should be obvious from across a room that the app is masked');
  assert.match(readFileSync('src/renderer/views/app.ts', 'utf8'), /'lockbtn sharebtn'/);
});

test('hidden means hidden, whatever a class says', async () => {
  // The browser's own rule is `[hidden] { display: none }`, which any class setting
  // `display` outranks. The find overlay opened itself on every launch because its own
  // layout rule won, and every screen in this app hides something with `hidden`.
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync('src/renderer/styles/app.css', 'utf8'),
    /\[hidden\] \{ display: none !important; \}/);
});

test('nothing on screen says a word nobody says', async () => {
  // Requisitions and harvest were the app's own vocabulary rather than anybody else's,
  // and artifact is the tell of prose nobody wrote by hand.
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const words = ['requisition', 'harvest', 'artifact', 'leverage', 'utilise', 'utilize',
    'seamless', 'robust', 'comprehensive', 'in order to', 'stakeholder', 'deliverable'];

  const found = [];
  const files = readdirSync('src/renderer/views').map((f) => join('src/renderer/views', f))
    .concat(['src/renderer/components/find.ts']);
  for (const file of files) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const code = line.trim();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('import')) continue;
      // Only prose: a string long enough to be a sentence, not an identifier or a class.
      for (const [, text] of line.matchAll(/'([^']{16,})'/g)) {
        // Prose, not a fragment of code that happens to sit between two quotes on a
        // line holding a template literal.
        if (!/^[A-Z\u00C0-\u017F]/.test(text)) continue;
        if (/[{}$`=<>]|=>/.test(text)) continue;
        for (const word of words) {
          if (text.toLowerCase().includes(word)) found.push(`${file}: ${text.slice(0, 60)}`);
        }
      }
    }
  }
  assert.deepEqual(found, [], 'these are on screen and nobody says them');
});

test('what belongs to the person is named as theirs', async () => {
  // "Files you add" is the app talking about itself. "My files" is the person's.
  const { readFileSync } = await import('node:fs');
  const settings = readFileSync('src/renderer/views/settings.ts', 'utf8');
  const privacy = readFileSync('src/renderer/views/privacy.ts', 'utf8');
  for (const label of ["'My files'", "'Alerts'", "'My name'", "'What I am looking for'"]) {
    assert.ok(settings.includes(label), `${label} is not what the screen says`);
  }
  for (const label of ["'My vault'", "'My data'", "'Where my vault is'"]) {
    assert.ok(privacy.includes(label), `${label} is not what the screen says`);
  }
});

test('every kind of button has an edge, because a live one must look pressable', () => {
  // With a transparent border, a ghost button read as a line of prose on the card it
  // sat on, and nothing on the page said it could be pressed.
  const css = readFileSync(join(STYLES, 'app.css'), 'utf8');
  const ghost = /\.btn\.ghost \{([^}]*)\}/.exec(css);
  assert.ok(ghost !== null, 'the ghost button has no rule at all');
  assert.doesNotMatch(ghost[1], /border-color:\s*transparent/,
    'a button with no edge is indistinguishable from the text around it');
});

test('a label with nothing to add is a label, not a label and a blank line', () => {
  // A setting whose control already says what it does gets no helper line. Rendered
  // anyway, the empty element still takes the space the sentence used to.
  const settings = readFileSync('src/renderer/views/settings.ts', 'utf8');
  const helpers = [...settings.matchAll(/description === '' \? null : el\('small'/g)];
  assert.equal(helpers.length, 2, 'row() and stacked() both have to skip an empty description');
  assert.doesNotMatch(settings, /row\('[^']+', ''[^)]*\)\s*,\s*el\('small'/);
});

test('no setting explains what its own control already says', () => {
  // Held by review rather than by a pattern: whether a sentence adds anything is a
  // judgement. What is checked is that the ones cut have not crept back.
  const cut = [
    'Tick it only when it is answered',
    'Then turn on the matching feed and press',
    'So you can open the posting again later',
    'What the role actually says',
    'Which column the calendar begins in',
    'Scales the whole interface',
  ];
  for (const file of readdirSync('src/renderer/views')) {
    if (!file.endsWith('.ts')) continue;
    const body = readFileSync(join('src/renderer/views', file), 'utf8');
    for (const one of cut) {
      assert.ok(!body.includes(one), `${file} explains an obvious control again: ${one}`);
    }
  }
});
