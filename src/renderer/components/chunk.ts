/** Long lists, drawn a screenful at a time. */

import { el, on } from './dom.js';

/** How many rows go in before the reader is asked whether they want more. Enough that
 *  scrolling feels normal, few enough that the browser is never asked to lay out
 *  thousands of rows nobody will reach. */
export const CHUNK = 150;

/** Draw `items` in chunks, with a button that says how many are left.
 *  A list that silently renders everything stops being a list: 19,678 rows is a quarter
 *  of a million elements and seven seconds before anything appears. */
export function inChunks<T>(
  host: HTMLElement,
  items: readonly T[],
  draw: (item: T) => HTMLElement,
  options: { noun: string; size?: number } = { noun: 'more' },
): void {
  const size = options.size ?? CHUNK;
  let shown = 0;

  const footer = el('div', { class: 'chunkfoot' });
  const more = (): void => {
    const next = items.slice(shown, shown + size);
    for (const item of next) footer.before(draw(item));
    shown += next.length;

    footer.replaceChildren();
    const left = items.length - shown;
    if (left === 0) {
      // Only worth saying when there was more than one screenful to begin with.
      if (items.length > size) {
        footer.append(el('p', { class: 'lede' }, `All ${items.length} shown.`));
      }
      return;
    }
    const button = el('button', { class: 'btn', type: 'button' },
      `Show ${Math.min(size, left)} more — ${left} ${options.noun} left`);
    on(button, 'click', () => more());
    footer.append(button);
  };

  host.append(footer);
  more();
}
