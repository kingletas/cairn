import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { suggestFor, intentOf, wordingScore, normalise, WORDING_FLOOR } from '../../dist/main/answers/match.js';
import { fieldsFromHtml } from '../../dist/main/answers/form.js';

const INTENTS = JSON.parse(readFileSync('defaults/questions.json', 'utf8')).intents;

const answer = (intent, question, text, kind = 'short') => ({
  id: intent ?? question, question, answer: text, intent, kind,
  usedCount: 0, updatedAt: '2026-09-07T00:00:00Z',
});

const BANK = [
  answer('work-authorisation', 'Are you legally allowed to work where this role is based?', 'Yes.', 'choice'),
  answer('sponsorship', 'Will you need visa sponsorship, now or later?', 'No.', 'choice'),
  answer('salary-expectation', 'What are you looking for in pay?', 'Open to discussing the range for the role.'),
  answer('notice-period', 'What is your notice period, and when could you start?', 'Four weeks.'),
  answer(null, 'What is your favourite build tool?', 'Whichever one the team already uses.'),
];

test('the same question in different words finds the same answer', () => {
  const wordings = [
    'Are you legally authorized to work in the United States?',
    'Do you have the right to work in this country?',
    'Work authorisation status',
  ];
  for (const wording of wordings) {
    const match = suggestFor(wording, BANK, INTENTS);
    assert.equal(match?.entry.intent, 'work-authorisation', wording);
    assert.equal(match.how, 'intent', wording);
  }
});

test('two questions that share words but ask opposite things are not confused', () => {
  // This is the pair that makes wording similarity alone unusable: both are about
  // being allowed to work, and answering one with the other is a wrong Yes or No.
  const sponsorship = suggestFor(
    'Do you now or will you in the future require sponsorship for employment visa status?', BANK, INTENTS);
  assert.equal(sponsorship?.entry.intent, 'sponsorship');

  const authorisation = suggestFor('Are you legally authorized to work in the United States?', BANK, INTENTS);
  assert.equal(authorisation?.entry.intent, 'work-authorisation');
  assert.notEqual(sponsorship.entry.id, authorisation.entry.id);
});

test('wording with no shared words still matches on meaning', () => {
  // "Desired salary" and "What are you looking for in pay?" share nothing at all.
  assert.equal(wordingScore('Desired salary', 'What are you looking for in pay?'), 0);
  const match = suggestFor('Desired salary', BANK, INTENTS);
  assert.equal(match?.entry.intent, 'salary-expectation');
  assert.equal(match.how, 'intent');
});

test('a question nobody catalogued is matched on wording', () => {
  const match = suggestFor('Which build tool do you prefer?', BANK, INTENTS);
  assert.equal(match?.entry.intent, null);
  assert.equal(match.how, 'wording');
  assert.ok(match.score >= WORDING_FLOOR);
});

test('a question with nothing close offers nothing at all', () => {
  // A blank field costs a moment. A wrong answer submitted under your own name does
  // not come back.
  for (const unrelated of [
    'Describe your experience with veterinary anaesthesia.',
    'What is the airspeed velocity of an unladen swallow?',
    '',
  ]) {
    assert.equal(suggestFor(unrelated, BANK, INTENTS), null, unrelated);
  }
});

test('an empty bank offers nothing rather than something', () => {
  assert.equal(suggestFor('Desired salary', [], INTENTS), null);
  const blank = [answer('salary-expectation', 'What are you looking for in pay?', '   ')];
  assert.equal(suggestFor('Desired salary', blank, INTENTS), null,
    'an unwritten answer must never be offered');
});

test('the longest matching phrase decides which question it is', () => {
  const intent = intentOf('Will you require sponsorship for employment visa status now or in future?', INTENTS);
  assert.equal(intent?.id, 'sponsorship');
});

test('spelling of authorise does not decide whether a match is found', () => {
  assert.equal(normalise('Authorized'), normalise('Authorised'));
  assert.equal(intentOf('work authorization', INTENTS)?.id, 'work-authorisation');
  assert.equal(intentOf('work authorisation', INTENTS)?.id, 'work-authorisation');
});

test('every shipped intent recognises its own prompt', () => {
  // An intent whose own wording does not match it would never fire on anything.
  for (const intent of INTENTS) {
    const found = intentOf(intent.terms[0], INTENTS);
    assert.equal(found?.id, intent.id, `${intent.id} does not recognise "${intent.terms[0]}"`);
  }
});

test('no shipped intent carries an answer', () => {
  for (const intent of INTENTS) {
    assert.ok(!('answer' in intent), `${intent.id} ships an answer, which describes a person`);
  }
});

test('a pasted form gives up its labels and what kind of field each is', () => {
  const html = `
    <form>
      <label for="name">Full name</label><input type="text" id="name" value="">
      <label for="why">Why do you want to work here?</label><textarea id="why"></textarea>
      <label for="auth">Are you legally authorized to work in the United States?</label>
      <select id="auth"><option>Yes</option><option>No</option></select>
      <label for="cv">Resume</label><input type="file" id="cv">
    </form>`;
  const fields = fieldsFromHtml(html);
  assert.deepEqual(fields.map((f) => f.label),
    ['Full name', 'Why do you want to work here?',
     'Are you legally authorized to work in the United States?', 'Resume']);
  assert.deepEqual(fields.map((f) => f.kind), ['short', 'long', 'choice', 'file']);
  assert.deepEqual(fields[2].options, ['Yes', 'No']);
});

test('a heading above a control counts as a label', () => {
  const fields = fieldsFromHtml('<h4>Notice period</h4><input type="text">');
  assert.equal(fields[0]?.label, 'Notice period');
});

test('a required marker is not mistaken for part of the question', () => {
  const fields = fieldsFromHtml('<label for="a">Desired salary *</label><input id="a" type="text">');
  assert.equal(fields[0]?.label, 'Desired salary');
});

test('a paragraph that happens to sit near an input is not a label', () => {
  const long = 'x'.repeat(400);
  const fields = fieldsFromHtml(`<label>${long}</label><input type="text">`);
  assert.deepEqual(fields, []);
});

test('the same label twice is one field', () => {
  const fields = fieldsFromHtml(
    '<label>Full name</label><input type="text"><label>Full name</label><input type="text">');
  assert.equal(fields.length, 1);
});

test('a form and a bank together produce answers with their reasons', () => {
  const html = `
    <label>Desired salary</label><input type="text">
    <label>Do you require sponsorship?</label><select><option>Yes</option><option>No</option></select>
    <label>Describe your experience with marine biology</label><textarea></textarea>`;
  const filled = fieldsFromHtml(html).map((field) => ({
    label: field.label,
    suggestion: suggestFor(field.label, BANK, INTENTS),
  }));
  assert.equal(filled[0].suggestion?.entry.intent, 'salary-expectation');
  assert.equal(filled[1].suggestion?.entry.intent, 'sponsorship');
  assert.equal(filled[2].suggestion, null, 'an unrelated question is left blank on purpose');
  assert.match(filled[0].suggestion.because, /asking the same thing/);
});

/** Wordings taken from what forms actually say. Coverage is a test rather than a
 *  hope: a phrasing that gets missed is a line added to questions.json, and this is
 *  what says whether it worked. */
const REAL_WORDINGS = [
  ['Are you legally authorized to work in the United States?', 'work-authorisation'],
  ['Do you have the right to work in the UK?', 'work-authorisation'],
  ['Work eligibility', 'work-authorisation'],
  ['Will you now or in the future require sponsorship for an employment visa?', 'sponsorship'],
  ['Do you require visa sponsorship?', 'sponsorship'],
  ['Notice period', 'notice-period'],
  ['When are you available to start?', 'notice-period'],
  ['Start date', 'notice-period'],
  ['What is your availability?', 'notice-period'],
  ['Desired salary', 'salary-expectation'],
  ['Expected compensation', 'salary-expectation'],
  ['What are your salary requirements?', 'salary-expectation'],
  ['Target salary', 'salary-expectation'],
  ['Where are you currently located?', 'location'],
  ['Country of residence', 'location'],
  ['Are you willing to relocate?', 'location'],
  ['Why do you want to work at this company?', 'why-this-company'],
  ['What interests you about this role?', 'why-this-company'],
  ['Reason for leaving your current position', 'why-leaving'],
  ['How did you hear about us?', 'how-heard'],
  ['Referral source', 'how-heard'],
  ['Tell us about a project you are proud of', 'experience-summary'],
  ['Describe a time you failed', 'hardest-problem'],
  ['How do you feel about being on call?', 'on-call'],
  ['What are you looking for in your next opportunity?', 'what-next'],
  ['GitHub profile', 'portfolio'],
  ['LinkedIn URL', 'portfolio'],
  ['Preferred pronouns', 'pronouns'],
  ['Do you require any reasonable adjustments?', 'accommodations'],
];

test('the wordings forms actually use are recognised', () => {
  const missed = REAL_WORDINGS
    .filter(([wording, expected]) => intentOf(wording, INTENTS)?.id !== expected)
    .map(([wording, expected]) => `${wording} -> expected ${expected}, got ${intentOf(wording, INTENTS)?.id ?? 'nothing'}`);
  assert.deepEqual(missed, [], `\n  ${missed.join('\n  ')}`);
});

test('a wording that means something else is not swept up by a broad term', () => {
  // "on call" appears inside plenty of prose. A term list that grows carelessly starts
  // answering questions it was never asked.
  const wrong = [
    ['Describe your experience with customer calls', 'on-call'],
    ['What is your current job title?', 'salary-expectation'],
  ];
  for (const [wording, mustNotBe] of wrong) {
    assert.notEqual(intentOf(wording, INTENTS)?.id, mustNotBe, wording);
  }
});

// --- the title screen ----------------------------------------------------

test('a title screen keeps what you asked for and drops what you did not', async () => {
  // A listing site returns everything it has. A search for a platform engineer comes
  // back with sales roles in it, and without this the queue fills with work nobody
  // asked about and stops being worth opening.
  const { titleMatches } = await import('../../dist/main/screening/checks.js');
  const wanted = ['Platform Engineer', 'Site Reliability Engineer', 'DevOps Engineer'];

  for (const keep of [
    'Platform Engineer', 'Senior Platform Engineer', 'Staff Platform Engineer, Core',
    'Site Reliability Engineer (Remote)', 'DevOps Engineer II',
  ]) {
    assert.notEqual(titleMatches(keep, wanted), null, keep);
  }

  for (const drop of [
    'Sales Jedi', 'Account Executive', 'Senior Product Designer',
    'Customer Success Manager', 'Staff Accountant', 'Senior Recruiter',
  ]) {
    assert.equal(titleMatches(drop, wanted), null, drop);
  }
});

test('a shared filler word is not a match on its own', () => {
  // "Senior Engineer" and "Senior Account Executive" share a word and nothing else.
  return import('../../dist/main/screening/checks.js').then(({ titleMatches }) => {
    assert.equal(titleMatches('Senior Account Executive', ['Senior Platform Engineer']), null);
    assert.equal(titleMatches('Remote Sales Lead', ['Remote Platform Engineer']), null);
  });
});

test('with no titles chosen, nothing is screened out on title', async () => {
  const { titleMatches } = await import('../../dist/main/screening/checks.js');
  assert.equal(titleMatches('Anything At All', []), null);
});

test('a title nobody named sets the lead aside, and says which list decides', async () => {
  // Reported rather than enforced, one run put 519 leads in the queue. Enforcing costs
  // a role with a title nobody searched for, which is why the message names the list.
  const { screen } = await import('../../dist/main/screening/checks.js');
  const context = {
    profile: {
      displayName: 'T', locations: [], remoteOnly: false, currency: 'USD',
      payFloor: 100000, payTarget: null, skills: [], families: ['infrastructure'],
      workAuthorisation: null, needsSponsorship: null,
    },
    settings: {
      maxPostingAgeDays: 30, requireFirstPartyPay: false, excludedEmployers: [],
      harvestCadenceHours: null, requestDelayMs: 0, sequentialFetch: true,
      identifyAs: 'cairn', keepDroppedHashes: true, theme: 'system', accent: 'pine',
      density: 'comfortable', textSize: 'default', weekStartsOn: 'monday',
      lockAfterMinutes: null, chaseAfterDays: 10, lastHarvest: null,
    },
    titles: ['Platform Engineer'],
    knownUrls: new Set(), knownPairs: new Set(), droppedHashes: new Set(), now: new Date(),
  };
  const lead = {
    company: 'Quarry Data', role: 'Head of Something Unusual',
    url: 'https://example.test/1',
    html: '<p>Base pay is $150,000 - $180,000.</p>',
    postedAt: new Date().toISOString(), statedPay: null, firstParty: true,
  };
  const result = await screen(lead, context);
  const title = result.verdicts.find((v) => v.check === 'title');
  assert.equal(title.outcome, 'fail', 'a title nobody named must set the lead aside');
  assert.match(title.because, /Settings/, 'the refusal must say where the list of titles is');
  assert.equal(result.clears, false, 'a lead with a title nobody named still reached the queue');

  // And the other direction, on the same lead: a title that is one of yours clears.
  const wanted = await screen({ ...lead, role: 'Senior Platform Engineer' }, context);
  assert.equal(wanted.verdicts.find((v) => v.check === 'title').outcome, 'pass');
  assert.equal(wanted.clears, true, 'a lead whose title is one of yours was set aside');
});
