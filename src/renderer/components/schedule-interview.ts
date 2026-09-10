/** Putting a date on a role that has reached the interviewing stage. */

import { el, on } from './dom.js';
import type { Opportunity } from '../../shared/types.js';

export function scheduleInterview(o: Opportunity, after: () => void): HTMLElement {
  const when = el('input', {
    type: 'datetime-local',
    'aria-label': `When is the interview for ${o.role} at ${o.company}?`,
  });
  const button = el('button', { class: 'btn', type: 'button' }, 'Schedule an interview');
  const problem = el('span', { class: 'ivnote' });

  on(button, 'click', () => {
    const at = when.value === '' ? null : new Date(when.value);
    if (at === null || Number.isNaN(at.getTime())) {
      problem.textContent = 'Pick a date and a time first.';
      return;
    }
    button.setAttribute('disabled', 'true');
    void window.cairn.interviews
      .create(o.id, at.toISOString())
      // Saving is what moves the role and writes the timeline entry, so there is one
      // path rather than two that can disagree about what happened.
      .then((interview) => window.cairn.interviews.save(interview))
      .then(after);
  });

  return el('div', { class: 'frow' }, when, button, problem);
}
