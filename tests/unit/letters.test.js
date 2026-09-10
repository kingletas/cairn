import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { refusals, isSendable } from '../../dist/main/letters/guard.js';
import { parseTemplate, fill } from '../../dist/main/letters/template.js';
import { checkPdf, RenderFailed } from '../../dist/main/letters/verify.js';

const LETTER_TEXT = readFileSync('tests/fixtures/letter.txt', 'utf8');

const GOOD = `Dear Hiring team,

I am applying for the Platform Engineer role at Northwind Systems. I spent the last
four years running the deploy path for a team of thirty, and the part I am proudest of
is that we stopped being woken up.

I would welcome the chance to talk it through.

Sam Ellery`;

test('an ordinary letter is sendable', () => {
  assert.deepEqual(refusals(GOOD), []);
  assert.equal(isSendable(GOOD), true);
});

test('an unfilled placeholder is refused, in every form it takes', () => {
  // The one that actually gets sent. It renders, it looks plausible, and it cannot
  // be taken back.
  const cases = [
    ['Dear {{hiring_manager}},\n\nI am applying.', 'template placeholder'],
    ['Dear [Hiring Manager],\n\nI am applying.', 'square-bracket placeholder'],
    ['I am applying for [Role Title] at your company.', 'square-bracket placeholder'],
    ['I have XXX years of experience.', 'note to yourself'],
    ['My reason: TODO', 'note to yourself'],
    ['Dear <insert name here>,', 'instruction to insert'],
  ];
  for (const [letter, expected] of cases) {
    const found = refusals(letter);
    assert.ok(found.length > 0, letter);
    assert.ok(found.some((r) => r.reason.includes(expected)), `${letter} -> ${JSON.stringify(found)}`);
  }
});

test('markup that survived extraction is refused', () => {
  for (const letter of [
    '## Cover letter\n\nDear team,',
    'Dear team,\n\n| Skill | Years |\n| --- | --- |',
    'Dear team,\n\n```\ncode\n```',
    'Dear team, see [[my notes]] for more.',
    '> [!tip] Remember to tailor this\n\nDear team,',
    '---\nname: Direct\n---\n\nDear team,',
  ]) {
    assert.ok(refusals(letter).length > 0, letter.slice(0, 40));
  }
});

test('a letter that talks about having been written is refused', () => {
  for (const letter of [
    "Here is your cover letter:\n\nDear team,",
    'Dear team,\n\nI hope this helps!',
    'Dear team,\n\nLet me know if you would like a different tone.',
    'As an AI, I would say I am a strong fit.',
    'Dear team,\n\nFeel free to adjust the second paragraph.',
  ]) {
    assert.ok(refusals(letter).length > 0, letter.slice(0, 40));
  }
});

test('everything wrong is reported at once, not one round at a time', () => {
  const bad = '## Draft\n\nDear [Hiring Manager],\n\nI hope this helps.';
  const found = refusals(bad);
  assert.ok(found.length >= 3, JSON.stringify(found));
});

test('a refusal quotes what caused it', () => {
  const [first] = refusals('Dear [Hiring Manager],');
  assert.equal(first.found, '[Hiring Manager]');
});

test('ordinary prose is not mistaken for a placeholder', () => {
  // The guard has to be usable. Refusing real sentences would train somebody to
  // ignore it, and then it catches nothing at all.
  for (const letter of [
    'I read your engineering blog post [1] with interest.',
    'I worked on TODOs — sorry, on task tracking — for two years.',
    'The team shipped three XXL features that quarter.',
    'I have led migrations at 3 companies.',
  ]) {
    assert.deepEqual(refusals(letter), [], letter);
  }
});

/** Two sentences a person could reasonably write that this refuses anyway. */
test('the guard errs toward refusing, and these are what that costs', () => {
  const knownFalsePositives = [
    ['I led the [Redacted] migration.', 'square-bracket placeholder'],
    ['We used to say it was "as an AI would design it", which was not a compliment.', 'model talking about itself'],
  ];
  for (const [letter, expected] of knownFalsePositives) {
    const found = refusals(letter);
    assert.ok(found.length > 0, `${letter} -- if this now passes, the rule was loosened`);
    assert.ok(found.some((r) => r.reason.includes(expected)), letter);
  }
});

test('an empty letter is never sendable', () => {
  assert.equal(isSendable(''), false);
  assert.equal(isSendable('   \n  '), false);
});

test('a template gives up its name, its use and its slots', () => {
  const source = readFileSync('defaults/templates/cover-letter/direct.md', 'utf8');
  const template = parseTemplate('direct', source);
  assert.equal(template.name, 'Direct');
  assert.ok(template.use.length > 0);
  assert.ok(template.slots.includes('company'));
  assert.ok(template.slots.includes('role'));
  assert.ok(!template.body.startsWith('---'), 'frontmatter must not reach the letter');
});

test('filling names what it could not fill rather than emptying it', () => {
  // A blank where a company name should be is only obvious to somebody who already
  // knows it should be there.
  const template = parseTemplate('t', 'Dear {{hiring_manager|Hiring team}},\n\n{{role}} at {{company}}.');
  const result = fill(template, { company: 'Northwind Systems' });
  assert.deepEqual(result.unfilled, ['role']);
  assert.match(result.letter, /Dear Hiring team,/, 'a fallback is used when there is one');
  assert.match(result.letter, /\{\{role\}\}/, 'an unfilled slot stays visible');
  assert.match(result.letter, /Northwind Systems/);
});

test('a filled template is sendable and an unfilled one is not', () => {
  const template = parseTemplate('t', 'Dear {{hiring_manager|Hiring team}},\n\nI am applying for {{role}} at {{company}}.\n\n{{your_name}}');
  assert.equal(isSendable(fill(template, { company: 'Northwind Systems' }).letter), false);
  const complete = fill(template, {
    company: 'Northwind Systems', role: 'Platform Engineer', your_name: 'Sam Ellery',
  });
  assert.deepEqual(complete.unfilled, []);
  assert.equal(isSendable(complete.letter), true);
});

test('every shipped template parses, declares its slots, and ships nothing filled in', () => {
  for (const file of readdirSync('defaults/templates/cover-letter')) {
    const template = parseTemplate(file, readFileSync(`defaults/templates/cover-letter/${file}`, 'utf8'));
    assert.ok(template.name.length > 0, file);
    assert.ok(template.use.length > 0, `${file} does not say when to reach for it`);
    assert.ok(template.slots.length > 0, `${file} has no slots, so nothing is left for a person`);
    // A skeleton is not sendable, and that is the point of it being a skeleton.
    assert.equal(isSendable(template.body), false, `${file} would pass the guard as shipped`);
    assert.doesNotMatch(template.body, /@[a-z0-9.-]+\.[a-z]{2,}/i, `${file} carries an email address`);
  }
});

// --- the rendered file --------------------------------------------------

test('a real rendered letter passes its own check', () => {
  const pdf = readFileSync('tests/fixtures/letter-good.pdf');
  const check = checkPdf(pdf, LETTER_TEXT);
  assert.equal(check.pages, 1, 'a two-page cover letter is a real cost and invisible in a preview');
  assert.ok(check.drawn >= check.characters * 0.6,
    `${check.drawn} drawn for ${check.characters} characters`);
});

test('a blank page is refused, which is the whole reason for the check', () => {
  // Every silent failure of headless printing produces exactly this: a valid PDF,
  // one page, and nothing on it. All of them exit successfully.
  const blank = readFileSync('tests/fixtures/letter-blank.pdf');
  assert.throws(() => checkPdf(blank, LETTER_TEXT), (error) => {
    assert.ok(error instanceof RenderFailed);
    assert.match(error.message, /nearly empty/);
    assert.match(error.message, /Nothing has been saved/);
    return true;
  });
});

test('something that is not a PDF is refused before anything else is read', () => {
  assert.throws(() => checkPdf(Buffer.from('<html>error page</html>'), LETTER_TEXT), RenderFailed);
});

test('the check is honest about what it cannot see', () => {
  // It counts glyphs, it does not read them. A letter rendered with the wrong words
  // has the right number of them and passes -- which is why this is a render check
  // and never a proofread.
  const pdf = readFileSync('tests/fixtures/letter-good.pdf');
  const differentTextSameLength = 'x'.repeat(LETTER_TEXT.replace(/\s/g, '').length);
  assert.doesNotThrow(() => checkPdf(pdf, differentTextSameLength));
});
