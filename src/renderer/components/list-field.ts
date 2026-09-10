/** A list of short things, shown as what they are. */

import { clear, el, on } from './dom.js';
import { splitList } from './split-list.js';

export interface ListFieldOptions {
  id: string;
  placeholder: string;
  /** Shown when the list is empty, in place of nothing at all. */
  empty: string;
  values: string[];
  save: (next: string[]) => void;
}

export function listField(options: ListFieldOptions): HTMLElement {
  const wrap = el('div', { class: 'listfield' });
  const chips = el('div', { class: 'listchips' });
  const input = el('input', { type: 'text', id: options.id, placeholder: options.placeholder });
  const add = el('button', { class: 'btn', type: 'button' }, 'Add');

  let values = [...options.values];

  const commit = (next: string[]): void => {
    values = next;
    options.save(values);
    draw();
  };

  /** Several at once, because pasting a list somebody already has written down is the
   *  commonest way this gets filled in. */
  const addFrom = (text: string): void => {
    const parts = splitList(text);
    if (parts.length === 0) return;
    const seen = new Set(values.map((v) => v.toLowerCase()));
    const additions = parts.filter((part) => !seen.has(part.toLowerCase()));
    input.value = '';
    if (additions.length > 0) commit([...values, ...additions]);
  };

  const draw = (): void => {
    clear(chips);
    if (values.length === 0) {
      chips.append(el('span', { class: 'listempty' }, options.empty));
      return;
    }
    for (const value of values) {
      const remove = el('button', {
        class: 'listchip', type: 'button', 'aria-label': `Remove ${value}`,
      }, value, el('span', { class: 'listx', 'aria-hidden': 'true' }, '×'));
      on(remove, 'click', () => commit(values.filter((v) => v !== value)));
      chips.append(remove);
    }
  };

  on(add, 'click', () => addFrom(input.value));
  on(input, 'keydown', (event) => {
    // Enter adds, and does not submit whatever form this happens to sit in.
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addFrom(input.value);
    }
  });
  // Typing something and clicking elsewhere should not lose it.
  on(input, 'blur', () => addFrom(input.value));

  draw();
  wrap.append(chips, el('div', { class: 'listadd' }, input, add));
  return wrap;
}
