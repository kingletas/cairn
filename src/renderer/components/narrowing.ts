/** The controls that narrow a list of roles, and the line saying what they took out. */

import { el, on } from './dom.js';
import { isNarrowed, settled, WHOLE_LIST, type Band, type Narrowing, type PayRules } from '../../shared/band.js';

/** Said in the words the pay rule uses, so a filter and the gate read the same. */
const BAND_LABEL: Record<Band, string> = {
  clears: 'Clears my target',
  under: 'Above my floor, under my target',
  below: 'Below my floor',
  unstated: 'No pay stated',
  uncompared: 'Nothing to compare',
};

const BANDS: readonly Band[] = ['clears', 'under', 'below', 'unstated', 'uncompared'];

export interface NarrowingOptions {
  now: Narrowing;
  skills: readonly string[];
  rules: PayRules;
  /** How many rows there are, and how many survived. The difference is the whole point
   *  of the control: a list that is quietly shorter than it was is a bug report. */
  total: number;
  shown: number;
  onChange: (next: Narrowing) => void;
}

function picker(label: string, options: readonly { value: string; text: string }[],
  chosen: string, onPick: (value: string) => void): HTMLElement {
  const select = el('select', { class: 'narrowpick', 'aria-label': label });
  for (const one of options) {
    const option = el('option', { value: one.value }, one.text);
    if (one.value === chosen) option.setAttribute('selected', 'true');
    select.append(option);
  }
  on(select, 'change', () => onPick(select.value));
  return select;
}

/** A control that cannot decide anything is worse than none, so a filter with nothing
 *  behind it says what to set rather than offering an empty list. */
function nothingSet(what: string): HTMLElement {
  return el('small', { class: 'nextsmall' }, what);
}

export function narrowingBar(options: NarrowingOptions): HTMLElement {
  const { skills, rules, total, shown, onChange } = options;
  const now = settled(options.now, rules, skills);
  const bar = el('div', { class: 'narrowbar' });

  bar.append(rules.payFloor === null
    ? nothingSet('Set a pay floor in Settings to narrow by pay.')
    : picker('Narrow by pay', [
        { value: 'any', text: 'Any pay' },
        ...BANDS.map((band) => ({ value: band, text: BAND_LABEL[band] })),
      ], now.band, (value) => onChange({ ...now, band: value as Band | 'any' })));

  bar.append(skills.length === 0
    ? nothingSet('Name a skill in Settings to narrow by one.')
    : picker('Narrow by skill', [
        { value: 'any', text: 'Any skill' },
        ...skills.map((skill) => ({ value: skill, text: skill })),
        { value: 'none', text: 'None of my skills' },
      ], now.skill, (value) => onChange({ ...now, skill: value })));

  if (isNarrowed(now)) {
    const clear = el('button', { class: 'btn ghost', type: 'button' }, 'Show everything');
    on(clear, 'click', () => onChange({ ...WHOLE_LIST }));
    bar.append(clear);
    // Said as what is missing rather than what is left: the count of rows is already on
    // the bar below, and a second number saying the same thing reads as a contradiction.
    bar.append(el('small', { class: 'narrowsaid' },
      shown === total
        ? 'Nothing is hidden by this.'
        : `${total - shown} of ${total} hidden.`));
  }

  return bar;
}
