/** One language at a time. The key is the English phrase itself, so nothing invents a
 *  name for a sentence and a missing entry falls back to the words it was written in. */

let phrases: Record<string, string> = {};
let code = 'en';

/** A sentence built around a value, with its values written as {0}, {1}. One entry
 *  covers every value it is shown with, and a translation can put the values in the
 *  order its own language needs rather than the order English used. */
type Shaped = { match: RegExp; into: string; slots: number; words: number };

let shaped: Shaped[] = [];
const worked = new Map<string, string>();
const REMEMBER = 500;

function forRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slotsIn(text: string): number[] {
  return [...text.matchAll(/\{(\d)\}/g)].map((one) => Number(one[1]));
}

/** A pattern is only usable when the translation fills the same slots the English did.
 *  One that drops a slot loses a number off the screen, and one that invents a slot
 *  leaves {2} sitting in the sentence. */
function shape(key: string, said: string): Shaped | null {
  const pieces = key.split(/\{\d\}/);
  const slots = pieces.length - 1;
  if (slots === 0) return null;
  const mine = new Set(slotsIn(key));
  const theirs = new Set(slotsIn(said));
  if (mine.size !== slots || theirs.size !== mine.size) return null;
  for (const one of theirs) if (!mine.has(one)) return null;
  return {
    match: new RegExp(`^${pieces.map(forRegExp).join('([\\s\\S]+?)')}$`),
    into: said,
    slots,
    words: pieces.join('').length,
  };
}

export function useLanguage(language: string, catalogue: Record<string, string>): void {
  code = language;
  phrases = catalogue;
  worked.clear();
  shaped = Object.entries(catalogue)
    .filter(([key, said]) => said.trim() !== '' && key.includes('{'))
    .map(([key, said]) => shape(key, said))
    .filter((one): one is Shaped => one !== null)
    // The most words first, so a sentence is read by the pattern that recognises most of
    // it. 'Sent with {0}.' would otherwise swallow the whole of the longer sentence.
    .sort((a, b) => b.words - a.words);
}

export function languageInUse(): string {
  return code;
}

function filled(text: string): string {
  for (const one of shaped) {
    const hit = one.match.exec(text);
    if (hit === null) continue;
    return one.into.replace(/\{(\d)\}/g, (_, digit: string) => hit[Number(digit) + 1] ?? '');
  }
  return text;
}

/** The phrase in the chosen language, or the English it was written in. Never a key and
 *  never blank: a half-translated screen should read as English, not as machinery. */
export function t(text: string): string {
  const found = phrases[text];
  if (found !== undefined && found.trim() !== '') return found;
  if (shaped.length === 0) return text;
  const already = worked.get(text);
  if (already !== undefined) return already;
  const said = filled(text);
  if (worked.size >= REMEMBER) worked.clear();
  worked.set(text, said);
  return said;
}

/** How much of the interface a catalogue actually covers. Shown rather than assumed,
 *  because a language that is 60% there is a different promise from one that is done. */
export function covered(catalogue: Record<string, string>, phraseCount: number): number {
  const real = Object.values(catalogue).filter((one) => one.trim() !== '').length;
  return phraseCount === 0 ? 0 : Math.min(100, Math.round((real / phraseCount) * 100));
}

/** How many phrases the interface can show, written down by the extractor rather than
 *  counted by hand. A catalogue's coverage means nothing without it. */
let known = 0;
let notYet = 0;

export function setPhraseCount(count: number, builtAroundAValue: number): void {
  known = count;
  notYet = builtAroundAValue;
}

export function phraseCount(): number {
  return known;
}

/** Sentences the extractor could not shape into a pattern, so they stay English in every
 *  language. Counted rather than left out: a coverage figure that ignores them is a
 *  false one. */
export function phrasesBuiltAroundAValue(): number {
  return notYet;
}
