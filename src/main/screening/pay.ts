/** Reading a pay range out of prose, and being honest about what was read. */

import type { Money, Provenance } from '../../shared/types.js';
import { sentenceAround } from './text.js';

const HOURS_PER_YEAR = 2080;
const MONTHS_PER_YEAR = 12;

const CURRENCIES: Record<string, string> = {
  '$': 'USD', '£': 'GBP', '€': 'EUR', 'usd': 'USD', 'gbp': 'GBP',
  'eur': 'EUR', 'cad': 'CAD', 'aud': 'AUD',
};

/** What a range in no stated currency is worth: nothing that can be compared.
 *  Assuming the reader's own currency is how a Canadian band clears a dollar floor. */
export const UNKNOWN_CURRENCY = 'unknown';

/** A currency named after the figures rather than before them, which is how a
 *  dollar-symbol country that is not the United States writes it. */
const TRAILING = /^[\s)\]]*\b(USD|GBP|EUR|CAD|AUD)\b/i;

/** Labels that mean the figure describes part of a band rather than all of it. */
export const PARTIAL_RANGE_LABELS = [
  'hiring range', 'starting range', 'min-mid', 'min - mid', 'midpoint',
  'target range', 'base range for new hires',
] as const;

const NUMBER = String.raw`(\d{1,3}(?:[,\s]\d{3})+|\d+(?:\.\d+)?\s*[kK]\b|\d{2,7}(?:\.\d+)?)`;
const CURRENCY = String.raw`([$£€]|\b(?:USD|GBP|EUR|CAD|AUD)\b)`;
const RANGE = new RegExp(
  String.raw`${CURRENCY}?\s*${NUMBER}\s*(?:-|–|—|\bto\b)\s*${CURRENCY}?\s*${NUMBER}`,
  'i',
);
const PERIOD = /\bper\s+(hour|hr|year|yr|annum|month|mo)\b|\/\s*(hour|hr|year|yr|month|mo)\b|\b(hourly|annually|monthly)\b/i;

/** Two small numbers with nothing marking them as money are almost always something
 *  else -- "5 - 10 years of experience", "2 to 3 days in the office". A currency
 *  symbol is what makes a two-digit figure a rate rather than a duration. */
const SMALLEST_UNMARKED = 1000;

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '');
  if (/[kK]$/.test(cleaned)) {
    const base = Number.parseFloat(cleaned.slice(0, -1));
    return Number.isFinite(base) ? Math.round(base * 1000) : null;
  }
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function periodOf(context: string): Money['period'] {
  const found = PERIOD.exec(context);
  const word = (found?.[1] ?? found?.[2] ?? found?.[3] ?? '').toLowerCase();
  if (word.startsWith('h')) return 'hour';
  if (word.startsWith('mo') || word === 'monthly') return 'month';
  return 'year';
}

/** Annualise, and say so. A rate card is not a salary band and the two must not be
 *  compared silently -- the conversion is recorded in the evidence line. */
export function annualise(amount: number, period: Money['period']): number {
  if (period === 'hour') return Math.round(amount * HOURS_PER_YEAR);
  if (period === 'month') return Math.round(amount * MONTHS_PER_YEAR);
  return amount;
}

export function parsePay(text: string, provenance: Provenance): Money | null {
  const match = RANGE.exec(text);
  if (!match) return null;

  const [whole, symbolA, lowRaw, symbolB, highRaw] = match;
  const low = toNumber(lowRaw ?? '');
  const high = toNumber(highRaw ?? '');
  if (low === null || high === null || low <= 0 || high < low) return null;

  const marked = Boolean(symbolA ?? symbolB) || /[kK]\b/.test(`${lowRaw}${highRaw}`);
  if (!marked && (low < SMALLEST_UNMARKED || high < SMALLEST_UNMARKED)) return null;

  const at = match.index;
  const context = text.slice(Math.max(0, at - 90), Math.min(text.length, at + whole.length + 90));
  const period = periodOf(context);
  // A word after the range beats a symbol before it. "$155,000-$220,000 CAD" is one
  // range in one currency, and the symbol is the half that cannot tell you which.
  const trailing = TRAILING.exec(text.slice(at + whole.length));
  const marker = trailing?.[1] ?? symbolA ?? symbolB ?? null;
  const currency = marker === null
    ? UNKNOWN_CURRENCY
    : CURRENCIES[marker.toLowerCase()] ?? UNKNOWN_CURRENCY;

  const evidence = sentenceAround(text, at);
  const note = period === 'year' ? evidence : `${evidence}  [converted from ${period}ly at ${period === 'hour' ? HOURS_PER_YEAR + ' hours' : '12 months'}]`;

  return {
    min: annualise(low, period),
    max: annualise(high, period),
    currency,
    period: 'year',
    provenance,
    evidence: note,
  };
}

/** Whether the text labels its own figure as part of a band. */
export function partialRangeLabel(text: string): string | null {
  const haystack = text.toLowerCase();
  for (const label of PARTIAL_RANGE_LABELS) {
    if (haystack.includes(label)) return label;
  }
  return null;
}
