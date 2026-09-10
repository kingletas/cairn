/** Turning a posting into text you can screen. */

export { toText } from '../../shared/text.js';

/** The sentence a phrase appears in, quoted rather than summarised, so a person can
 *  disagree with the reading rather than take the verdict on faith. */
export function sentenceAround(text: string, index: number): string {
  const start = Math.max(0, text.lastIndexOf('.', index) + 1, text.lastIndexOf('\n', index) + 1);
  const stopAt = [text.indexOf('.', index), text.indexOf('\n', index)].filter((n) => n > -1);
  const end = stopAt.length ? Math.min(...stopAt) + 1 : Math.min(text.length, index + 180);
  return text.slice(start, end).trim().replace(/\s+/g, ' ');
}

/** Find any of `phrases`, case-insensitively, and quote the sentence it sat in. */
export function findPhrase(
  text: string,
  phrases: readonly string[],
): { phrase: string; evidence: string } | null {
  const haystack = text.toLowerCase();
  for (const phrase of phrases) {
    const needle = phrase.toLowerCase();
    if (needle === '') continue;
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at < 0) break;
      if (onWordBoundaries(haystack, at, needle.length)) {
        return { phrase, evidence: sentenceAround(text, at) };
      }
      from = at + 1;
    }
  }
  return null;
}

/** A phrase has to be the whole word, not a run of letters inside one. "US" matched
 *  "discuss" and "UK" matched "Ukraine", and each one quoted the sentence it found
 *  them in as evidence that the posting named a place it never mentioned. */
function onWordBoundaries(haystack: string, at: number, length: number): boolean {
  const wordish = /[\p{L}\p{N}]/u;
  const before = at === 0 ? '' : haystack[at - 1] ?? '';
  const after = haystack[at + length] ?? '';
  const startsWord = wordish.test(haystack[at] ?? '');
  const endsWord = wordish.test(haystack[at + length - 1] ?? '');
  if (startsWord && before !== '' && wordish.test(before)) return false;
  if (endsWord && after !== '' && wordish.test(after)) return false;
  return true;
}

/** How often each term appears. Counted and reported -- never thresholded here,
 *  because whether a technology is the job or a line in the requirements is a
 *  judgement about those numbers rather than a number itself. */
export function countMentions(text: string, terms: readonly string[]): Record<string, number> {
  const haystack = text.toLowerCase();
  const counts: Record<string, number> = {};
  for (const term of terms) {
    const needle = term.toLowerCase();
    if (!needle) continue;
    let from = 0;
    let n = 0;
    for (;;) {
      const at = haystack.indexOf(needle, from);
      if (at === -1) break;
      n += 1;
      from = at + needle.length;
    }
    if (n > 0) counts[term] = n;
  }
  return counts;
}
