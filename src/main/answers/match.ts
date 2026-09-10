/** Matching a form's wording to a question you have already answered, by intent first and
 *  wording second. Nothing is filled in automatically; a match is a suggestion. */

import type { AnswerBankEntry } from '../../shared/types.js';

export interface QuestionIntent {
  id: string;
  prompt: string;
  kind: 'choice' | 'short' | 'long';
  terms: string[];
}

export interface Suggestion {
  entry: AnswerBankEntry;
  /** 0 to 1. At 1 the meaning matched; below that the wording did. */
  score: number;
  how: 'intent' | 'wording';
  /** Why this was offered, in words a person can disagree with. */
  because: string;
}

/** Words that carry no meaning here and would otherwise make every question look a
 *  bit like every other one. */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'do', 'does', 'did',
  'you', 'your', 'yours', 'we', 'us', 'our', 'me', 'my', 'this', 'that', 'these',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'if', 'as', 'by', 'from',
  'what', 'why', 'how', 'when', 'where', 'which', 'who', 'will', 'would', 'can',
  'could', 'have', 'has', 'had', 'any', 'please', 'tell', 'about',
]);

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(authorisation|authorization)\b/g, 'authorisation')
    .replace(/\b(authorised|authorized)\b/g, 'authorised')
    .replace(/\b(organisation|organization)\b/g, 'organisation')
    .trim();
}

function significantWords(text: string): Set<string> {
  return new Set(
    normalise(text).split(' ').filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  );
}

/** Dice coefficient over significant words: twice the overlap, divided by the total.
 *  It rewards two short questions that share their few real words, which is the shape
 *  of a form label. */
export function wordingScore(a: string, b: string): number {
  const left = significantWords(a);
  const right = significantWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

/** Which intent a piece of form wording is asking about, if any. */
export function intentOf(label: string, intents: readonly QuestionIntent[]): QuestionIntent | null {
  const text = normalise(label);
  let best: { intent: QuestionIntent; length: number } | null = null;
  for (const intent of intents) {
    for (const term of intent.terms) {
      const needle = normalise(term);
      // The longest matching phrase wins. Several wordings contain "sponsorship", and
      // the longer phrase is the one that pinned down which question it actually is.
      if (needle.length > 0 && text.includes(needle) && (best === null || needle.length > best.length)) {
        best = { intent, length: needle.length };
      }
    }
  }
  return best?.intent ?? null;
}

/** Below this, nothing is offered. A blank field is a moment's work; a wrong answer
 *  submitted under your own name is not recoverable. */
export const WORDING_FLOOR = 0.5;

export function suggestFor(
  label: string,
  entries: readonly AnswerBankEntry[],
  intents: readonly QuestionIntent[],
): Suggestion | null {
  const answered = entries.filter((entry) => entry.answer.trim().length > 0);
  if (answered.length === 0) return null;

  const intent = intentOf(label, intents);
  if (intent !== null) {
    const byIntent = answered.find((entry) => entry.intent === intent.id);
    if (byIntent) {
      return {
        entry: byIntent,
        score: 1,
        how: 'intent',
        because: `This is asking the same thing as “${byIntent.question}”.`,
      };
    }
  }

  let best: Suggestion | null = null;
  for (const entry of answered) {
    const score = wordingScore(label, entry.question);
    if (score >= WORDING_FLOOR && (best === null || score > best.score)) {
      best = {
        entry,
        score,
        how: 'wording',
        because: `The wording is close to “${entry.question}”. Check it before you use it.`,
      };
    }
  }
  return best;
}
