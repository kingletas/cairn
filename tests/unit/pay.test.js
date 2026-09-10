import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePay, partialRangeLabel, annualise } from '../../dist/main/screening/pay.js';

test('a plain annual range is read with its currency', () => {
  const pay = parsePay('The range for this role is $150,000 - $180,000 per year.', 'first-party');
  assert.deepEqual([pay.min, pay.max, pay.currency], [150000, 180000, 'USD']);
});

test('k-notation is understood', () => {
  const pay = parsePay('£75k – £85k depending on experience', 'first-party');
  assert.deepEqual([pay.min, pay.max, pay.currency], [75000, 85000, 'GBP']);
});

test('an hourly rate is annualised and says so', () => {
  // A rate card is not a salary band. Converting silently would let the two be
  // compared against a floor as though they were the same thing.
  const pay = parsePay('$60 - $80 per hour', 'aggregated');
  assert.equal(pay.min, annualise(60, 'hour'));
  assert.match(pay.evidence, /converted from hourly/);
});

test('provenance is carried, never inferred', () => {
  assert.equal(parsePay('$100,000 to $120,000', 'aggregated').provenance, 'aggregated');
  assert.equal(parsePay('$100,000 to $120,000', 'first-party').provenance, 'first-party');
});

test('a partial range labels itself', () => {
  assert.equal(partialRangeLabel('Hiring range: $120,000 - $140,000'), 'hiring range');
  assert.equal(partialRangeLabel('Base salary $120,000 - $140,000'), null);
});

test('prose with no range yields nothing rather than a guess', () => {
  assert.equal(parsePay('Competitive salary and equity.', 'first-party'), null);
});

test('a reversed range is refused rather than swapped', () => {
  assert.equal(parsePay('$180,000 - $150,000', 'first-party'), null);
});

test('a plain small range is not mistaken for money', () => {
  // "5 - 10 years of experience" and "2 to 3 days in the office" are the reason a
  // two-digit figure needs a currency symbol before it counts as a rate.
  assert.equal(parsePay('We want 5 - 10 years of experience.', 'first-party'), null);
  assert.equal(parsePay('You will be in the office 2 to 3 days a week.', 'first-party'), null);
});

test('an unmarked annual range is still read', () => {
  const pay = parsePay('The band is 150000 to 180000.', 'first-party');
  assert.deepEqual([pay.min, pay.max], [150000, 180000]);
});
