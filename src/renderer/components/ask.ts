/** Ask the assistant something, and show what would leave before it leaves.
 *  Every task in the app goes through here, so there is one place that can send. */

import { clear, el, on, readableSize, saying } from './dom.js';
import { screenShareOn } from '../mask.js';
import type { AssistantResult, AssistantTask } from '../../shared/types.js';

const TITLES: Record<AssistantTask, string> = {
  'read-posting': 'Read this posting',
  'draft-letter': 'Draft a letter',
  'suggest-answer': 'Suggest an answer',
  research: 'Research this employer',
};

/** Where the request lands, in the wording the panel uses about itself. */
function summary(host: string, model: string, bytes: number, tokens: number): HTMLElement {
  return el('div', { class: 'askfacts' },
    el('div', {}, el('label', {}, 'Where it goes'), el('b', {}, host)),
    el('div', {}, el('label', {}, 'Model'), el('b', {}, model)),
    el('div', {}, el('label', {}, 'Size'), el('b', {}, `${readableSize(bytes)} · about ${tokens} tokens`)),
  );
}

export async function ask(
  task: AssistantTask, subject: string, extra?: string,
): Promise<AssistantResult | null> {
  const box = el('div', { class: 'askbox' });
  const curtain = el('div', { class: 'askcurtain', role: 'dialog', 'aria-modal': 'true' }, box);
  document.body.append(curtain);

  return new Promise<AssistantResult | null>((resolve) => {
    const finish = (value: AssistantResult | null): void => {
      curtain.remove();
      document.removeEventListener('keydown', escape);
      resolve(value);
    };
    const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') finish(null); };
    document.addEventListener('keydown', escape);

    const problem = (text: string): void => {
      clear(box);
      const close = el('button', { class: 'btn', type: 'button' }, 'Close');
      on(close, 'click', () => finish(null));
      box.append(
        el('h3', {}, TITLES[task]),
        el('p', { class: 'problem', role: 'alert' }, text),
        el('div', { class: 'askacts' }, close),
      );
    };

    const send = (ticket: string): void => {
      clear(box);
      box.append(el('h3', {}, TITLES[task]), el('p', {}, 'Asking. This can take a moment.'));
      window.cairn.assistant.send(ticket)
        .then((result) => finish(result))
        .catch((error: unknown) => problem(saying(error)));
    };

    window.cairn.assistant.prepare(task, subject, extra)
      .then(({ ticket, leaving, quiet }) => {
        if (quiet) { send(ticket); return; }

        const go = el('button', { class: 'btn solid', type: 'button' }, 'Send it');
        const not = el('button', { class: 'btn', type: 'button' }, 'Not now');
        on(go, 'click', () => send(ticket));
        on(not, 'click', () => { void window.cairn.assistant.cancel(ticket); finish(null); });

        // The payload names the employer and quotes the posting, which is exactly what
        // masking is for. Turning masking off is the way to read it, and it is one press.
        const body = screenShareOn()
          ? el('div', { class: 'askbody' },
              el('p', { class: 'asknote' },
                'Masked for sharing, so the payload is not on screen. Turn masking off in the rail '
                + 'to read every word of what is about to go.'))
          : el('div', { class: 'askbody' },
              el('div', { class: 'askpart' },
                el('label', {}, 'What Cairn is asking it to do'), el('pre', {}, leaving.system)));
        if (!screenShareOn()) {
          for (const message of leaving.messages) {
            body.append(el('div', { class: 'askpart' },
              el('label', {}, `What goes with it (${message.role})`), el('pre', {}, message.content)));
          }
        }

        clear(box);
        box.append(el('div', { class: 'askinner' },
          el('h3', {}, TITLES[task]),
          el('p', {},
            'This is everything that leaves, in full. Nothing is summarised and nothing else is sent.'),
          summary(leaving.host, leaving.model, leaving.bytes, leaving.estimatedTokens),
          leaving.grounded
            ? el('p', { class: 'asknote' }, 'It will search the web and has to name a source for every sentence.')
            : null,
          el('p', { class: 'asknote' },
            leaving.key === 'none'
              ? 'No key goes with it. '
              : `Your key goes with it as ${leaving.key}. `,
            leaving.pricing === ''
              ? 'Cairn does not know what this costs.'
              : 'Cairn ships no price list, because a stale figure is worse than none — ',
            leaving.pricing === '' ? null : pricingLink(leaving.pricing)),
          body,
          el('div', { class: 'askacts' }, not, go)));
      })
      .catch((error: unknown) => problem(saying(error)));
  });
}

function pricingLink(url: string): HTMLElement {
  const link = el('button', { class: 'linkbtn', type: 'button' }, 'what your provider charges');
  on(link, 'click', () => { void window.cairn.open.external(url); });
  return link;
}
