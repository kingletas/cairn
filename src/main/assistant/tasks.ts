/** The four jobs, as a request going out and records coming back. Pure: it builds
 *  text and reads text, and every rule about what may survive is testable. */

import type { Money, Profile, Verdict } from '../../shared/types.js';
import { parsePay } from '../screening/pay.js';
import { claims, jsonIn, supported, unsourced } from './guard.js';
import type { AssistantOutcome, AssistantRequest } from './provider.js';

/** Said on every request. The reading tasks are the ones that would otherwise invent,
 *  so the instruction not to is the first thing in the prompt. */
const HOUSE =
  'You are helping somebody run their own job search. Quote rather than summarise, and '
  + 'never state anything the source does not say. If something is not there, say so.';

const READING_SHAPE = `{
  "pay":         { "quote": "the sentence, word for word", "reading": "what it says" } or null,
  "location":    { "quote": "...", "reading": "..." } or null,
  "sponsorship": { "quote": "...", "reading": "..." } or null,
  "seniority":   { "quote": "...", "reading": "..." } or null
}`;

export function readPostingRequest(posting: string, model: string, effort: AssistantRequest['effort']): AssistantRequest {
  return {
    model,
    effort,
    maxTokens: 1500,
    system: `${HOUSE} Read the job posting and answer only with JSON in this shape:\n${READING_SHAPE}\n`
      + 'Every quote must be copied from the posting exactly. Use null where the posting is silent.',
    messages: [{ role: 'user', content: posting }],
  };
}

interface Read {
  quote?: unknown;
  reading?: unknown;
}

const LABELS: Record<string, string> = {
  pay: 'pay, read by your assistant',
  location: 'where the work is, read by your assistant',
  sponsorship: 'sponsorship, read by your assistant',
  seniority: 'seniority, read by your assistant',
};

/** What the assistant read, kept only where the quote really is in the posting.
 *  A fact whose quote is not there was written rather than read. */
export function readingFrom(
  outcome: AssistantOutcome, posting: string,
): { verdicts: Verdict[]; pay: Money | null; dropped: string[] } {
  const parsed = jsonIn(outcome.text) as Record<string, Read | null> | null;
  if (parsed === null) return { verdicts: [], pay: null, dropped: [] };

  const verdicts: Verdict[] = [];
  const dropped: string[] = [];
  let pay: Money | null = null;

  for (const [field, label] of Object.entries(LABELS)) {
    const found = parsed[field];
    if (found === null || found === undefined) continue;
    const quote = typeof found.quote === 'string' ? found.quote : '';
    const reading = typeof found.reading === 'string' ? found.reading : '';
    if (!supported(quote, posting)) {
      dropped.push(label);
      continue;
    }
    verdicts.push({ check: label, outcome: 'ask', because: reading, evidence: quote });
    // Cairn's own parser runs on the quote rather than trusting the figure the model
    // typed, so the band on the card is still read by the same code as every other.
    if (field === 'pay') pay = parsePay(quote, 'aggregated');
  }

  return { verdicts, pay, dropped };
}

export function draftLetterRequest(options: {
  skeleton: string;
  posting: string;
  about: { company: string; role: string };
  profile: Profile;
  model: string;
  effort: AssistantRequest['effort'];
}): AssistantRequest {
  const { profile } = options;
  return {
    model: options.model,
    effort: options.effort,
    maxTokens: 2000,
    system: `${HOUSE} Draft a cover letter in the applicant's own plain voice. `
      + 'No headings, no bullet points, no placeholders, and nothing addressed to the applicant. '
      + 'Claim nothing about them that is not in what you were given.',
    messages: [{
      role: 'user',
      content: [
        `Company: ${options.about.company}`,
        `Role: ${options.about.role}`,
        profile.displayName.trim() === '' ? '' : `They are called ${profile.displayName}.`,
        profile.skills.length === 0 ? '' : `Skills they listed: ${profile.skills.join(', ')}.`,
        '',
        'The skeleton to follow:',
        options.skeleton,
        '',
        'The posting:',
        options.posting,
      ].filter((line) => line !== '').join('\n'),
    }],
  };
}

/** A draft, with the sentences somebody has to check listed beside it. */
export function draftFrom(outcome: AssistantOutcome): { letter: string; check: string[] } {
  const letter = outcome.text.trim();
  return { letter, check: claims(letter) };
}

/** Some employers ask for the applicant's own words and say so on the form. Handing
 *  them a drafted paragraph to paste is a misrepresentation to the one reader who asked
 *  not to have it, so the deliverable degrades by a step: material, never sentences. */
export function suggestAnswerRequest(options: {
  question: string;
  profile: Profile;
  existing: { question: string; answer: string }[];
  ownWords?: boolean;
  model: string;
  effort: AssistantRequest['effort'];
}): AssistantRequest {
  const written = options.existing
    .slice(0, 12)
    .map((one) => `Q: ${one.question}\nA: ${one.answer}`)
    .join('\n\n');
  const system = options.ownWords === true
    ? `${HOUSE} The employer asked for the applicant's own words, so write no prose for them `
      + 'to paste. Give short bullets only: facts worth using, angles worth taking, and what '
      + 'to leave out. Never a sentence they could send as it stands. Invent no fact about them.'
    : `${HOUSE} Write one answer to an application form question, in the applicant's voice, `
      + 'as they would type it. No preamble and no offer to revise. Invent no fact about them.';
  return {
    model: options.model,
    effort: options.effort,
    maxTokens: 600,
    system,
    messages: [{
      role: 'user',
      content: [
        `The question: ${options.question}`,
        options.profile.skills.length === 0 ? '' : `Skills they listed: ${options.profile.skills.join(', ')}.`,
        options.ownWords === true
          ? 'They will write the answer themselves from what you give them.'
          : '',
        written === '' || options.ownWords === true
          ? ''
          : `Answers they have already written, for voice:\n\n${written}`,
      ].filter((line) => line !== '').join('\n\n'),
    }],
  };
}

export function researchRequest(
  company: string, model: string, effort: AssistantRequest['effort'],
): AssistantRequest {
  return {
    model,
    effort,
    maxTokens: 2000,
    grounded: true,
    system: `${HOUSE} Search for what this employer does, roughly how big they are, and anything `
      + 'recent worth knowing before an interview. Every sentence must rest on a page you found, '
      + 'and name the site it came from in the sentence. Write nothing you did not find.',
    messages: [{ role: 'user', content: `The employer: ${company}` }],
  };
}

/** A note, or nothing. Sourced or not at all: a note whose sentences are half sourced
 *  is the harder one to read, because nothing marks which half. */
export function researchFrom(
  outcome: AssistantOutcome,
): { note: string; citations: AssistantOutcome['citations'] } | { refused: string[] } {
  const note = outcome.text.trim();
  const loose = unsourced(note, outcome.citations);
  if (loose.length > 0) return { refused: loose.map((one) => one.sentence) };
  return { note, citations: outcome.citations };
}
