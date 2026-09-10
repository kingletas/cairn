/** Find anything, from anywhere. Ctrl+K, or ⌘K on a Mac. */

import { clear, el, on } from './dom.js';
import * as mask from '../mask.js';
import type { Found } from '../../main/search.js';

const WHERE: Record<Found['kind'], { label: string; view: string }> = {
  role: { label: 'Pipeline', view: 'pipeline' },
  lead: { label: 'Leads', view: 'requisitions' },
  answer: { label: 'Answer bank', view: 'answers' },
  document: { label: 'Documents', view: 'documents' },
  interview: { label: 'Interviews', view: 'interviews' },
};

/** The overlay, and a function that opens it. One instance for the life of the shell:
 *  a second would answer the same key and both would be listening. */
export function findEverything(goTo: (view: string, focus?: string) => void): { open: () => void; element: HTMLElement } {
  const field = el('input', {
    type: 'text', id: 'findall', placeholder: 'Find a role, a lead, an answer, a document',
    autocomplete: 'off', 'aria-label': 'Find anything',
  });
  const results = el('div', { class: 'findresults' });
  const curtain = el('div', { class: 'findcurtain', hidden: true, role: 'dialog', 'aria-modal': 'true' },
    el('div', { class: 'findbox' }, field, results));

  /** What the box says before anybody has typed. Without it the box is a lone input
   *  dropped over the page, which reads as something broken rather than as a dialog. */
  const atRest = (): HTMLElement =>
    el('p', { class: 'findrest' },
      'Roles, leads, answers, documents and interviews. Two letters to start, and every ',
      el('b', {}, 'word'), ' has to match. ',
      el('span', { class: 'findkey' }, 'Esc'), ' closes this.');

  const close = (): void => {
    curtain.hidden = true;
    field.value = '';
    clear(results);
    results.append(atRest());
  };

  const draw = (found: Found[]): void => {
    clear(results);
    if (field.value.trim().length < 2) { results.append(atRest()); return; }
    if (found.length === 0) {
      results.append(el('p', { class: 'planline' }, 'Nothing matches all of those words.'));
      return;
    }
    for (const one of found) {
      const where = WHERE[one.kind];
      const row = el('button', { class: 'findrow', type: 'button' },
        el('span', {}, el('b', {}, one.kind === 'role' || one.kind === 'lead'
          ? one.title : mask.company(one.title)),
          el('small', {}, mask.company(one.detail))),
        el('small', { class: 'findwhere' }, where.label));
      if (one.evidence !== null) {
        row.append(el('small', { class: 'findevidence' }, mask.amounts(mask.company(one.evidence))));
      }
      on(row, 'click', () => { close(); goTo(where.view, one.kind === 'role' ? one.id : undefined); });
      results.append(row);
    }
  };

  let asked = 0;
  on(field, 'input', () => {
    const query = field.value;
    const mine = ++asked;
    if (query.trim().length < 2) { clear(results); results.append(atRest()); return; }
    void window.cairn.search.everything(query).then((found) => {
      // An answer for a query somebody has already typed past is a list that jumps
      // under them, so a slower one that arrived late is dropped.
      if (mine === asked) draw(found);
    });
  });

  on(field, 'keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Escape') close();
  });
  on(curtain, 'click', (event) => { if (event.target === curtain) close(); });

  results.append(atRest());

  return {
    element: curtain,
    open: (): void => { curtain.hidden = false; field.focus(); field.select(); },
  };
}
