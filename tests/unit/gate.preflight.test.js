import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateState, GATE_QUESTIONS } from '../../dist/shared/types.js';
import { CHECKS } from '../../dist/renderer/views/preflight.js';

const answers = (settled) => ({ answers: GATE_QUESTIONS.map((q) => ({ id: q.id, answer: 'decided', settled })) });

test('a gate nobody has touched is not run', () => {
  assert.equal(gateState(null), 'not-run');
  assert.equal(gateState({ answers: [] }), 'not-run');
  assert.equal(gateState({ answers: GATE_QUESTIONS.map((q) => ({ id: q.id, answer: null, settled: false })) }), 'not-run');
});

test('a question described rather than answered leaves the gate partial', () => {
  // The tell is a gate that describes a field instead of answering it: accurate, and
  // it reads as done. A required box noted and never drafted is exactly this.
  const gate = answers(true);
  gate.answers[4] = { id: gate.answers[4].id, answer: 'there is a culture question', settled: false };
  assert.equal(gateState(gate), 'partial');
});

test('a gate is run only when every question is settled', () => {
  assert.equal(gateState(answers(true)), 'run');
  assert.equal(gateState({ answers: answers(true).answers.slice(0, 4) }), 'partial');
});

const role = (over) => ({
  id: 'r', company: 'Northwind', role: 'Platform Engineer', url: null, location: null,
  remote: 'remote', pay: null, stage: 'applied', fit: null, family: null,
  nextAction: null, nextActionDue: null, postedAt: null, capturedAt: '2026-08-01',
  appliedAt: '2026-08-20', resumeFile: null, resumeId: null, archivedAt: null, notes: null,
  gate: answers(true), blocker: null, concession: null, contact: null, followupChannel: 'referral',
  ...over,
});

const run = (id, roles) => CHECKS.find((c) => c.id === id).find(roles);

test('every check is silent on a role that is in order', () => {
  for (const check of CHECKS) assert.deepEqual(check.find([role()]), []);
});

test('an application with an incomplete gate is caught', () => {
  assert.equal(run('gate', [role({ gate: null })]).length, 1);
  // A gate never reached is not a gate skipped: nothing was sent.
  assert.equal(run('gate', [role({ gate: null, appliedAt: null })]).length, 0);
});

test('an owed concession is caught, and a delivered one is not', () => {
  assert.equal(run('concession', [role({ concession: 'owed' })]).length, 1);
  assert.equal(run('concession', [role({ concession: 'delivered' })]).length, 0);
});

test('a blocker is caught until it is cleared, and clearing keeps the record', () => {
  assert.equal(run('blocker', [role({ blocker: 'PA eligibility unconfirmed' })]).length, 1);
  assert.equal(run('blocker', [role({ blocker: 'CLEARED 2026-09-01 — PA eligibility unconfirmed' })]).length, 0);
});

test('a follow-up date with no channel is caught, and none-found is an answer', () => {
  const due = { nextActionDue: '2026-09-20', followupChannel: null };
  assert.equal(run('channel', [role(due)]).length, 1);
  assert.equal(run('channel', [role({ ...due, followupChannel: 'none-found' })]).length, 0);
});

test('nothing archived reaches any check', () => {
  const dead = role({ gate: null, concession: 'owed', blocker: 'something', archivedAt: '2026-09-01' });
  for (const check of CHECKS) assert.deepEqual(check.find([dead]), [], check.id);
});

// --- the two states the answers can never add up to -----------------------

test('a gate that cannot be run is not a gate nobody has started', () => {
  // Blocked is twenty-five aggregator rows with no route: there is nothing to start.
  // Both read as not-run, which is two different failures under one word.
  assert.equal(gateState({ answers: [], declared: 'blocked' }), 'blocked');
  assert.equal(gateState({ ...answers(true), declared: 'blocked' }), 'blocked',
    'a declaration outranks whatever the answers add up to');
});

test('an application sent before Cairn says so, and stays visible', () => {
  assert.equal(gateState({ answers: [], declared: 'retrofitted' }), 'retrofitted');
  const before = role({ gate: { answers: [], declared: 'retrofitted' } });
  assert.equal(run('gate', [before]).length, 0, 'it is not a task');
  assert.equal(run('before', [before]).length, 1, 'and it is still on the screen');
});

test('the record tab stays out of the count the screen greets you with', () => {
  const advisory = CHECKS.filter((c) => c.advisory === true).map((c) => c.id);
  assert.deepEqual(advisory, ['before']);
  // Importing a pipeline means every application in it predates the gate. Sixty-six
  // findings on a page built to be empty is the check training you to close it.
  assert.equal(CHECKS.filter((c) => c.advisory !== true).length, 4);
});

// --- question five, which cannot be answered in a sentence ----------------

test('a required box with nothing in it holds the gate at partial', async () => {
  const { undrafted } = await import('../../dist/shared/types.js');
  const noted = {
    ...answers(true),
    fields: [{ label: 'In 2 sentences, what advice would you give?', required: true, answer: null, ownWords: false }],
  };
  assert.equal(gateState(noted), 'partial');
  assert.equal(undrafted(noted).length, 1);

  const drafted = { ...noted, fields: [{ ...noted.fields[0], answer: 'Measure it before you argue about it.' }] };
  assert.equal(gateState(drafted), 'run');
  assert.equal(undrafted(drafted).length, 0);
});

test('an optional box left blank does not hold anything up', () => {
  const gate = {
    ...answers(true),
    fields: [{ label: 'Anything else?', required: false, answer: null, ownWords: false }],
  };
  assert.equal(gateState(gate), 'run');
});

test('the check says the one thing its own tab cannot', () => {
  const says = CHECKS.find((c) => c.id === 'gate').says;
  assert.equal(says(role()), '', 'a state the tab already names adds nothing');
  assert.match(
    says(role({ gate: { ...answers(true), fields: [{ label: 'Why us?', required: true, answer: null, ownWords: false }] } })),
    /1 required box undrafted/,
  );
  assert.match(says(role({ gate: { answers: [], declared: 'blocked' } })), /no route to apply/);
});
