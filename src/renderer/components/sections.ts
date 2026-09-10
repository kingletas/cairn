/** One long page split into named sections. */

import { clear, el, on } from './dom.js';

export interface SectionDef<Id extends string> {
  id: Id;
  label: string;
  /** Fills the section. Most of these read the vault, so it may be async. */
  draw: (host: HTMLElement) => void | Promise<void>;
}

export function sections<Id extends string>(options: {
  body: HTMLElement;
  label: string;
  defs: readonly SectionDef<Id>[];
  showing: Id;
  remember: (id: Id) => void;
}): void {
  const { body, defs, showing, remember } = options;
  const host = el('div', {});
  const buttons = new Map<Id, HTMLElement>();
  const bar = el('nav', { class: 'tabs', 'aria-label': options.label });

  const paint = (id: Id): void => {
    for (const [key, button] of buttons) button.setAttribute('aria-selected', String(key === id));
    clear(host);
    void defs.find((def) => def.id === id)?.draw(host);
  };

  for (const def of defs) {
    const button = el('button', { class: 'tab', type: 'button', 'aria-selected': 'false' }, def.label);
    on(button, 'click', () => { remember(def.id); paint(def.id); });
    buttons.set(def.id, button);
    bar.append(button);
  }

  clear(body);
  body.append(bar, host);
  paint(showing);
}
