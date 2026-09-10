/** Renders the real views against fixture data, with no vault and no main process. */

import { renderApp } from '../../dist/renderer/views/app.js';

const settings = {
  maxPostingAgeDays: 30, requireFirstPartyPay: false, excludedEmployers: [],
  harvestCadenceHours: null, requestDelayMs: 1500, sequentialFetch: true,
  identifyAs: 'cairn', keepDroppedHashes: true, theme: 'system', accent: 'pine',
  density: 'comfortable', textSize: 'default', weekStartsOn: 'monday', lockAfterMinutes: 15,
};

const pay = (min, max, provenance) => ({
  min, max, currency: 'USD', period: 'year', provenance, evidence: null,
});

const now = new Date().toISOString();
const opportunities = [
  ['Northwind Systems', 'Platform Engineer', 'considering', 'Read the role description', null, pay(140000, 160000, 'first-party')],
  ['Halcyon Labs', 'Site Reliability Engineer', 'considering', 'Decide by Friday', null, pay(150000, 190000, 'aggregated')],
  ['Tessellate', 'Infrastructure Engineer', 'preparing', 'Finish four answers', now, pay(160000, 200000, 'first-party')],
  ['Bramblewick', 'Backend Engineer', 'applied', 'Chase after the 20th', null, pay(130000, 155000, 'first-party')],
  ['Quarry Data', 'Platform Engineer', 'applied', null, null, null],
  ['Fenwick Cloud', 'Staff Engineer', 'interviewing', 'Technical round tomorrow', now, pay(180000, 230000, 'first-party')],
].map(([company, role, stage, nextAction, nextActionDue, payValue], i) => ({
  id: `fixture-${i}`, company, role, url: null, location: null, remote: 'remote',
  pay: payValue, stage, fit: null, family: null, nextAction, nextActionDue,
  postedAt: null, capturedAt: now, archivedAt: null, notes: null,
}));

const verdict = (check, outcome, because, evidence) =>
  evidence ? { check, outcome, because, evidence } : { check, outcome, because };

const requisitions = [
  {
    id: 'r1', company: 'Northwind Systems', role: 'Platform Engineer',
    url: 'https://example.test/1', raw: '', sourceId: 'greenhouse',
    capturedAt: now, state: 'waiting',
    pay: { min: 150000, max: 180000, currency: 'USD', period: 'year', provenance: 'first-party', evidence: null },
    screening: {
      clears: true,
      verdicts: [
        verdict('employer-excluded', 'pass', 'Not on your excluded list.'),
        verdict('already-known', 'pass', 'New to you.'),
        verdict('pay-floor', 'pass', 'The top of the range clears your target.',
          'The base range for this role is $150,000 - $180,000.'),
        verdict('pay-provenance', 'pass', "This is the employer's own figure."),
        verdict('freshness', 'pass', 'Posted 3 days ago.'),
        verdict('location-clause', 'ask',
          'The posting says something about where you have to be. Read it before you decide.',
          'Remote within the country, with two days a week in the office for anyone within commuting distance.'),
        verdict('skills', 'ask', 'Mentions: Kubernetes 7, Terraform 2.'),
      ],
      open: [
        'Does the location actually work for you?',
        'Is your specialty the job here, or a line in the requirements?',
        'Is this a fit?',
      ],
    },
  },
  {
    id: 'r2', company: 'Halcyon Labs', role: 'Site Reliability Engineer',
    url: 'https://example.test/2', raw: '', sourceId: 'remotive',
    capturedAt: now, state: 'waiting',
    pay: { min: 150000, max: 190000, currency: 'USD', period: 'year', provenance: 'aggregated', evidence: null },
    screening: {
      clears: true,
      verdicts: [
        verdict('employer-excluded', 'pass', 'Not on your excluded list.'),
        verdict('already-known', 'pass', 'New to you.'),
        verdict('pay-floor', 'pass', 'Above your floor but under your target of 160,000 -- worth a look on a strong match.',
          'Compensation: $150,000 to $190,000 depending on experience.'),
        verdict('pay-provenance', 'ask',
          'This figure comes from a listing site, not the employer. It has no standing until their own posting agrees.'),
        verdict('pay-partial-range', 'ask',
          'The posting calls this a "hiring range", so the top of it is not the ceiling.',
          'Hiring range: $150,000 to $190,000.'),
        verdict('freshness', 'unknown', 'No posting date given.'),
        verdict('named-employer', 'ask', 'This looks like it was posted for an employer it does not name.',
          'We are recruiting for a well-funded infrastructure company.'),
        verdict('skills', 'ask', 'None of your skills are mentioned.'),
      ],
      open: ['Is your specialty the job here, or a line in the requirements?', 'Is this a fit?'],
    },
  },
];

const sourceStates = [
  { id: 'greenhouse', enabled: true, lastRun: null, lastError: null, boards: 0 },
  { id: 'lever', enabled: true, lastRun: null, lastError: null, boards: 0 },
  { id: 'ashby', enabled: true, lastRun: null, lastError: null, boards: 0 },
  { id: 'smartrecruiters', enabled: true, lastRun: null, lastError: null, boards: 0 },
  { id: 'remotive', enabled: false, lastRun: null, lastError: null, boards: 0 },
  { id: 'arbeitnow', enabled: false, lastRun: null, lastError: null, boards: 0 },
];

const catalogue = [
  { id: 'greenhouse', label: 'Greenhouse job boards', kind: 'ats', provenance: 'first-party' },
  { id: 'lever', label: 'Lever postings', kind: 'ats', provenance: 'first-party' },
  { id: 'ashby', label: 'Ashby job boards', kind: 'ats', provenance: 'first-party' },
  { id: 'smartrecruiters', label: 'SmartRecruiters postings', kind: 'ats', provenance: 'first-party' },
  { id: 'remotive', label: 'Remotive', kind: 'aggregator', provenance: 'aggregated' },
  { id: 'arbeitnow', label: 'Arbeitnow', kind: 'aggregator', provenance: 'aggregated' },
];

const boards = [];

const intents = JSON.parse(await (await fetch('../../defaults/questions.json')).text()).intents;

const answerBank = [
  { id: 'a1', question: 'Are you legally allowed to work where this role is based?',
    answer: 'Yes, without restriction.', intent: 'work-authorisation', kind: 'choice',
    usedCount: 7, updatedAt: now },
  { id: 'a2', question: 'Will you need visa sponsorship, now or later?',
    answer: 'No, not now and not in future.', intent: 'sponsorship', kind: 'choice',
    usedCount: 6, updatedAt: now },
  { id: 'a3', question: 'What are you looking for in pay?',
    answer: 'I would rather hear the range for the role first. If it helps, I am looking in the upper half of the band you have published.',
    intent: 'salary-expectation', kind: 'short', usedCount: 4, updatedAt: now },
  { id: 'a4', question: 'What is your notice period, and when could you start?',
    answer: 'Four weeks, and I can be flexible on the end date.', intent: 'notice-period',
    kind: 'short', usedCount: 3, updatedAt: now },
  { id: 'a5', question: 'How do you handle being on call?',
    answer: 'I have carried a pager on a two-week rotation. The thing that made it survivable was ruthless alert hygiene: anything that fired and did not need a human that night got fixed or deleted the next morning.',
    intent: 'on-call', kind: 'long', usedCount: 0, updatedAt: now },
];

const { parseTemplate, fill } = await import('../../dist/main/letters/template.js');
const { refusals, isSendable } = await import('../../dist/main/letters/guard.js');

const templateSources = await Promise.all(
  ['direct', 'referral', 'career-change'].map(async (id) => [
    id, await (await fetch(`../../defaults/templates/cover-letter/${id}.md`)).text(),
  ]),
);
const letterTemplates = templateSources.map(([id, src]) => parseTemplate(id, src));

const resumeDocs = [
  { id: 'd1', kind: 'resume', title: 'Résumé v3 — infrastructure',
    relativePath: 'documents/Résumé v3 — infrastructure.pdf', format: 'pdf',
    isDefault: true, note: 'The one that gets sent unless the role is unusual.',
    usedCount: 9, updatedAt: now },
  { id: 'd2', kind: 'resume', title: 'Résumé v2 — general',
    relativePath: 'documents/Résumé v2 — general.pdf', format: 'pdf',
    isDefault: false, note: 'Older, broader. For anything outside infrastructure.',
    usedCount: 2, updatedAt: now },
  { id: 'd3', kind: 'resume', title: 'Résumé — working draft',
    relativePath: 'documents/Résumé — working draft.md', format: 'markdown',
    isDefault: false, note: '', usedCount: 0, updatedAt: now },
];

const applied = (days) => new Date(Date.now() - days * 86400000).toISOString();
const sentApplications = [
  { opportunity: { ...opportunities[3], appliedAt: applied(3), stage: 'applied' },
    lastEvent: { id: 'e1', opportunityId: opportunities[3].id, at: applied(3), kind: 'applied', detail: null },
    resume: resumeDocs[0] },
  { opportunity: { ...opportunities[4], appliedAt: applied(21), stage: 'applied' },
    lastEvent: { id: 'e2', opportunityId: opportunities[4].id, at: applied(21), kind: 'applied', detail: null },
    resume: resumeDocs[1] },
  { opportunity: { ...opportunities[5], appliedAt: applied(12), stage: 'interviewing' },
    lastEvent: { id: 'e3', opportunityId: opportunities[5].id, at: applied(2), kind: 'interview', detail: 'Round one, 45 minutes' },
    resume: resumeDocs[0] },
  { opportunity: { ...opportunities[1], appliedAt: applied(34), stage: 'applied', archivedAt: applied(6) },
    lastEvent: { id: 'e4', opportunityId: opportunities[1].id, at: applied(6), kind: 'rejected', detail: null },
    resume: null },
];
const timelines = {
  [opportunities[5].id]: [
    { id: 't1', opportunityId: opportunities[5].id, at: applied(2), kind: 'interview', detail: 'Round one, 45 minutes' },
    { id: 't2', opportunityId: opportunities[5].id, at: applied(9), kind: 'reply', detail: 'Recruiter got in touch' },
    { id: 't3', opportunityId: opportunities[5].id, at: applied(12), kind: 'applied', detail: null },
  ],
};

const soon = (days, hour = 14) => {
  const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const interviews = [
  { id: 'i1', opportunityId: opportunities[5].id, at: soon(1), minutes: 60,
    round: 'technical round', people: 'Dan Okoro — engineering manager, your future manager.\nDirect, moves fast. Asked twice about on-call in the screen.',
    joinUrl: 'https://example.test/call/abc', notes: '',
    questions: 'What does a bad week look like here?\nWhat happened the last time an incident went badly?\nWho decides what gets built?',
    prepared: ['Re-read the role description'], outcome: 'scheduled' },
  { id: 'i2', opportunityId: opportunities[2].id, at: soon(8, 11), minutes: 45,
    round: 'first conversation', people: '', joinUrl: null, notes: '', questions: '',
    prepared: [], outcome: 'scheduled' },
];
const dated = [
  { at: soon(1), kind: 'interview', title: 'Fenwick Cloud — technical round', detail: 'Dan Okoro', opportunityId: opportunities[5].id, stage: 'interviewing' },
  { at: soon(8, 11), kind: 'interview', title: 'Tessellate — first conversation', detail: null, opportunityId: opportunities[2].id, stage: 'preparing' },
  { at: soon(3), kind: 'deadline', title: 'Vercel application closes', detail: null, opportunityId: opportunities[2].id, stage: 'preparing' },
  { at: soon(-4), kind: 'sent', title: 'Applied to Bramblewick', detail: 'Backend Engineer', opportunityId: opportunities[3].id, stage: 'applied' },
  { at: soon(6), kind: 'action', title: 'Chase if you have not heard', detail: 'Quarry Data · Platform Engineer', opportunityId: opportunities[4].id, stage: 'applied' },
];

window.cairn = {
  vault: {
    status: async () => ({
      unlocked: true, exists: true, sizeBytes: 135168, cipher: 'ChaCha20-Poly1305',
      kdf: { algorithm: 'Argon2id', memoryKib: 65536, passes: 3, lanes: 1 },
      outboundToday: 0, lastBackupAt: null, machineName: 'auburn-heron',
    }),
    lock: async () => true,
    touch: async () => true,
  },
  settings: { get: async () => settings, set: async () => true },
  profile: {
    get: async () => ({
      displayName: 'Sam Ellery', locations: ['Remote'], remoteOnly: true, currency: 'USD',
      payFloor: 140000, payTarget: 160000, skills: ['Kubernetes', 'Go', 'Terraform'],
      families: ['infrastructure', 'software'], workAuthorisation: 'anywhere in the US',
      needsSponsorship: false,
    }),
    save: async () => true,
  },
  setup: {
    isComplete: async () => true,
    defaults: async () => ({ families: { families: JSON.parse(await (await fetch('../../defaults/families.json')).text()).families } }),
  },
  opportunities: { list: async () => opportunities, save: async () => true },
  outbound: { recent: async () => [] },
  letters: {
    templates: async () => letterTemplates,
    fill: async (id, values) => {
      const template = letterTemplates.find((t) => t.id === id);
      const result = fill(template, values);
      return { ...result, refusals: refusals(result.letter), sendable: isSendable(result.letter) };
    },
    check: async (letter) => ({ refusals: refusals(letter), sendable: isSendable(letter) }),
    render: async () => { throw new Error('Rendering needs the real app — this is a preview.'); },
  },
  documents: {
    list: async () => resumeDocs,
    import: async () => null,
    save: async () => true,
    setDefault: async () => true,
    forget: async () => true,
    reveal: async () => true,
  },
  interviews: {
    list: async () => interviews,
    next: async () => ({ interview: interviews[0], opportunity: opportunities[5] }),
    save: async () => true,
    create: async () => interviews[0],
    remove: async () => true,
  },
  calendar: { things: async () => dated },
  applications: {
    list: async () => sentApplications,
    events: async (id) => (timelines[id] ?? []),
    markSent: async () => true,
    addEvent: async () => true,
  },
  answers: {
    list: async () => answerBank,
    intents: async () => intents,
    save: async () => true,
    create: async () => answerBank[0],
    remove: async () => true,
    used: async () => true,
    readForm: async (html) => {
      const { fieldsFromHtml } = await import('../../dist/main/answers/form.js');
      const { suggestFor } = await import('../../dist/main/answers/match.js');
      return fieldsFromHtml(html).map((field) => ({
        field, suggestion: suggestFor(field.label, answerBank, intents),
      }));
    },
  },
  requisitions: { list: async () => requisitions, keep: async () => null, drop: async () => true },
  sources: {
    list: async () => sourceStates,
    catalogue: async () => catalogue,
    setEnabled: async (id, enabled) => {
      const found = sourceStates.find((s) => s.id === id);
      if (found) found.enabled = enabled;
      return true;
    },
  },
  boards: { list: async () => boards, add: async () => boards[0], remove: async () => true },
  harvest: {
    plan: async () => {
      const kinds = Object.fromEntries(catalogue.map((c) => [c.id, c.kind]));
      const targets = [];
      const blocked = [];
      for (const s of sourceStates.filter((s) => s.enabled)) {
        if (kinds[s.id] === 'ats') {
          const mine = boards.filter((b) => b.sourceId === s.id);
          if (mine.length === 0) {
            blocked.push({ sourceId: s.id, because: 'no boards added yet — paste a link from a company’s careers page below' });
          } else for (const b of mine) targets.push({ sourceId: s.id, token: b.token, company: b.company });
        } else {
          for (const t of ['Platform Engineer', 'Site Reliability Engineer']) {
            targets.push({ sourceId: s.id, token: t, company: t });
          }
        }
      }
      return { targets, blocked, requests: targets.length };
    },
    run: async () => ({ outcomes: [], requisitions: 0, ranAt: now }),
  },
};

const root = document.getElementById('root');
const status = await window.cairn.vault.status();
await renderApp(root, status);
