/** Where a role sits against the pay you set, and which of your skills a posting names.
 *  Shared, so a filter on a list and the gate on a role cannot disagree about one role. */

import type { Money } from './types.js';

/** `uncompared` is two different silences — no floor set, or a range in another
 *  currency — and both mean the same thing to a person: nothing was compared. */
export type Band = 'clears' | 'under' | 'below' | 'unstated' | 'uncompared';

export interface PayRules {
  payFloor: number | null;
  payTarget: number | null;
  currency: string;
}

/** The top of a range is what a role is worth, so that is the figure compared. */
export function bandOf(pay: Money | null, rules: PayRules): Band {
  if (pay === null) return 'unstated';
  if (rules.payFloor === null || pay.currency !== rules.currency) return 'uncompared';
  const ceiling = pay.max ?? pay.min ?? 0;
  if (ceiling < rules.payFloor) return 'below';
  const target = rules.payTarget ?? rules.payFloor;
  return ceiling < target ? 'under' : 'clears';
}

/** Your skills a posting names, in the order you listed them. Matched the way the gate
 *  counts them — anywhere in the text, ignoring case — so the two always agree. */
export function skillsNamed(posting: string | null, skills: readonly string[]): string[] {
  if (posting === null) return [];
  const haystack = posting.toLowerCase();
  return skills.filter((one) => one.trim() !== '' && haystack.includes(one.toLowerCase()));
}

/** What a list is narrowed to. `any` on both is the whole list. */
export interface Narrowing {
  band: Band | 'any';
  /** `any`, `none` for a posting naming none of yours, or one of your skills. A skill
   *  you actually named wins over both words, so calling one "none" still works. */
  skill: string;
}

export const WHOLE_LIST: Narrowing = { band: 'any', skill: 'any' };

/** The narrowing as it can actually be applied today. A skill you have since taken off
 *  your profile, or a band with no pay floor behind it, decides nothing — and a control
 *  that reads as set while deciding nothing is the worst of both. */
export function settled(narrowing: Narrowing, rules: PayRules, skills: readonly string[]): Narrowing {
  const named = skills.includes(narrowing.skill);
  const usable = named || (narrowing.skill === 'none' && skills.length > 0);
  return {
    band: rules.payFloor === null ? 'any' : narrowing.band,
    skill: usable ? narrowing.skill : 'any',
  };
}

export function isNarrowed(narrowing: Narrowing): boolean {
  return narrowing.band !== 'any' || narrowing.skill !== 'any';
}

/** The two things a narrowing reads. A row is whatever the list holds, so the caller
 *  says where they are rather than the list being reshaped to suit the filter. */
export interface Narrowable {
  pay: Money | null;
  posting: string | null;
}

export function narrow<T>(
  rows: readonly T[],
  narrowing: Narrowing,
  rules: PayRules,
  skills: readonly string[],
  of: (row: T) => Narrowable,
): T[] {
  const asked = settled(narrowing, rules, skills);
  const named = skills.includes(asked.skill);
  return rows.filter((row) => {
    const one = of(row);
    if (asked.band !== 'any' && bandOf(one.pay, rules) !== asked.band) return false;
    if (asked.skill === 'any') return true;
    const found = skillsNamed(one.posting, skills);
    return named ? found.includes(asked.skill) : found.length === 0;
  });
}
