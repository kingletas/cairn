import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPlace, spellingsOf, normalisePlaces, normaliseAuthorisation } from '../../dist/main/screening/places.js';
import { findPhrase } from '../../dist/main/screening/text.js';

/** A posting says "United States", a person types "US", and until both mean the same
 *  place the location screen is comparing two spellings.
 */
test('one country, however it is typed', () => {
  for (const typed of ['US', 'us', 'U.S.', 'USA', 'u.s.a', 'United States', 'united states of america', 'America']) {
    assert.equal(canonicalPlace(typed), 'United States', `${typed} should be the same place`);
  }
  for (const typed of ['UK', 'u.k.', 'Great Britain', 'England', 'Scotland']) {
    assert.equal(canonicalPlace(typed), 'United Kingdom', `${typed} should be the same place`);
  }
});

test('a place Cairn has never heard of is kept exactly as it was written', () => {
  // A city, a county, a made-up region. Rewriting one would be Cairn deciding it knows
  // better about somewhere it has no table for.
  assert.equal(canonicalPlace('Guadalajara'), null);
  assert.deepEqual(normalisePlaces(['Guadalajara']), ['Guadalajara']);
  assert.deepEqual(spellingsOf('Guadalajara'), ['Guadalajara']);
});

test('the same country typed three ways is one entry', () => {
  assert.deepEqual(normalisePlaces(['US', 'USA', 'united states', 'Canada']), ['United States', 'Canada']);
  assert.deepEqual(normalisePlaces([' ', '', 'UK']), ['United Kingdom']);
});

test('a profile spelling finds every posting spelling', () => {
  const spellings = spellingsOf('US');
  for (const posting of [
    'Open to anyone in the US.',
    'This role is United States only.',
    'Must be authorised to work in the USA.',
    'Remote across America.',
  ]) {
    assert.notEqual(findPhrase(posting, spellings), null, `missed: ${posting}`);
  }
});

test('a country is a whole word, not a run of letters inside one', () => {
  // "US" matched "discuss" and "UK" matched "Ukraine", and each one quoted the sentence
  // it found them in as evidence that the posting named a place it never mentioned.
  assert.equal(findPhrase('We would love to discuss this role.', spellingsOf('US')), null);
  assert.equal(findPhrase('Hiring across Ukraine.', spellingsOf('UK')), null);
  assert.equal(findPhrase('A focus on customer trust.', spellingsOf('US')), null);
  assert.notEqual(findPhrase('Based in Ukraine.', spellingsOf('Ukraine')), null);
});

test('work authorisation keeps a sentence and settles a country', () => {
  // "anywhere in the EU, on a permit I already hold" is not a country, and rewriting it
  // would put words in somebody's mouth on a form.
  assert.equal(normaliseAuthorisation('usa'), 'United States');
  assert.equal(normaliseAuthorisation('  UK '), 'United Kingdom');
  assert.equal(normaliseAuthorisation('anywhere in the UK'), 'anywhere in the UK');
  assert.equal(normaliseAuthorisation('   '), null);
  assert.equal(normaliseAuthorisation(null), null);
});

test('no two places claim the same spelling', () => {
  // One spelling meaning two countries would silently pick whichever was listed first.
  const seen = new Map();
  for (const name of ['United States', 'United Kingdom', 'Ireland', 'Canada', 'India', 'Australia']) {
    for (const spelling of spellingsOf(name)) {
      const flat = spelling.toLowerCase().replace(/[^a-z0-9]/g, '');
      assert.ok(!seen.has(flat) || seen.get(flat) === name,
        `${spelling} is claimed by both ${seen.get(flat)} and ${name}`);
      seen.set(flat, name);
    }
  }
});
