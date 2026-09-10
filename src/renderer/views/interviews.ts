/** Interviews: the one you are preparing for, which is usually the next one. */

import { clear, el, on } from '../components/dom.js';
import { scheduleInterview } from '../components/schedule-interview.js';
import { goTo, refresh } from './app.js';
import type { Interview, Opportunity } from '../../shared/types.js';
import { CHANNELS } from '../../shared/types.js';
import { readableDue } from '../components/dates.js';
import * as mask from '../mask.js';

/** Which interview the page is preparing for. The next one until somebody picks
 *  another: two in a week meant only one of them could be prepared for. */
let preparing: string | null = null;

export async function renderInterviews(body: HTMLElement): Promise<void> {
  const [next, all, opportunities] = await Promise.all([
    window.cairn.interviews.next(),
    window.cairn.interviews.list(),
    window.cairn.opportunities.list(),
  ]);

  // A role reaches the interviewing stage without a date, and those count too. Without
  // them this page read empty while the front page counted two.
  const dated = new Set(all.filter((one) => one.outcome === 'scheduled').map((one) => one.opportunityId));
  const undated = opportunities.filter((o) => o.stage === 'interviewing' && !dated.has(o.id));

  if (next === null && undated.length === 0) {
    body.append(
      el('div', { class: 'empty' },
        el('h2', {}, 'Nothing scheduled'),
        el('p', {},
          'When you have a date, add it from the application and this page becomes what you ' +
          'prepare from — who you are meeting, what to ask them, and what is left to do.'),
        toApplications()),
    );
    return;
  }

  if (next === null) {
    body.append(waitingForADate(undated));
    return;
  }

  // The one being prepared for: whichever was picked, or the next one.
  const picked = all.find((one) => one.id === preparing && one.outcome === 'scheduled');
  const interview = picked ?? next.interview;
  const role = picked === undefined
    ? next.opportunity
    : opportunities.find((o) => o.id === picked.opportunityId) ?? next.opportunity;

  body.append(header(interview, role));
  body.append(el('div', { class: 'ivgrid' },
    el('div', {}, people(interview), afterTheRound(role), questions(interview)),
    el('div', {}, checklist(interview), others(all, interview),
      undated.length > 0 ? waitingForADate(undated) : null)));
}

/** Roles at the interviewing stage with no date on them. The state nothing could show
 *  and nothing could count, and the one where somebody actually has to do something. */
function waitingForADate(undated: Opportunity[]): HTMLElement {
  const panel = el('section', { class: 'panel' },
    el('h3', {}, 'At interview, with no date yet'),
    el('p', {},
      `${undated.length === 1 ? 'This one reached' : 'These reached'} the interviewing stage ` +
      'without a date. Put one in and this page becomes what you prepare from.'));
  for (const o of undated) {
    panel.append(
      el('div', { class: 'frow stacked' },
        el('div', {}, el('label', {}, mask.company(o.company)), el('small', {}, o.role)),
        scheduleInterview(o, () => refresh())));
  }
  return panel;
}

function header(interview: Interview, o: Opportunity): HTMLElement {
  const when = new Date(interview.at);
  const card = el('section', { class: 'ivhead' },
    el('p', { class: 'ivwhen' },
      `${readableDue(interview.at)} · ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${interview.minutes} minutes`),
    el('h3', {}, `${mask.company(o.company)} — ${interview.round || 'interview'}`),
    el('p', {}, o.role));

  const actions = el('div', { class: 'ivacts' });
  if (interview.joinUrl !== null && interview.joinUrl.length > 0) {
    const join = el('a', { class: 'btn solid', href: interview.joinUrl, target: '_blank', rel: 'noreferrer' }, 'Join the call');
    actions.append(join, el('span', { class: 'ivnote' }, 'opens in your browser'));
  }

  // An interview that is called off leaves the role at the interviewing stage with a
  // date that has passed, and there was no way to say so from anywhere in the app.
  const cancel = el('button', { class: 'btn ghost', type: 'button' }, 'Cancel this interview');
  on(cancel, 'click', () => {
    cancel.setAttribute('disabled', 'true');
    void window.cairn.interviews.remove(interview.id).then(() => refresh());
  });
  actions.append(cancel);

  card.append(actions);
  return card;
}

function people(interview: Interview): HTMLElement {
  return el('section', { class: 'panel' },
    el('h3', {}, 'Who you are meeting'),
    el('p', {}, 'Your own notes, written after each conversation.'),
    editable(interview, 'people', 'Names, roles, and anything you know about them'),
  );
}

/** The round is the one event in this pipeline that reliably produces a contact.
 *  Every application confirmation comes from a no-reply address; the people in the room
 *  arrive with the invitation, and both go when the invitation is archived. */
function afterTheRound(o: Opportunity): HTMLElement {
  const contact = el('input', { type: 'text', class: 'wide', value: o.contact ?? '',
    placeholder: 'Name, title, and an address — and which of them was in the room' });
  const channel = el('select', {},
    ...['', ...CHANNELS].map((value) => el('option',
      value === (o.followupChannel ?? '') ? { value, selected: 'selected' } : { value },
      value === '' ? 'Not looked yet' : value)));
  const keep = (): void => {
    const via = (channel as HTMLSelectElement).value;
    void window.cairn.opportunities.save({
      ...o,
      contact: contact.value.trim() === '' ? null : contact.value.trim(),
      followupChannel: via === '' ? null : (via as Opportunity['followupChannel']),
    });
  };
  on(contact, 'change', keep);
  on(channel, 'change', keep);
  return el('section', { class: 'panel' },
    el('h3', {}, 'Who a follow-up goes to'),
    el('p', {}, 'The addresses are in the invitation and they go when it is archived. '
      + 'A thank-you is a reply to a conversation and stops reading as one after about a day.'),
    el('div', { class: 'frow stacked' }, el('div', {}, el('label', {}, 'Contact')), contact),
    el('div', { class: 'frow stacked' }, el('div', {}, el('label', {}, 'Channel')), channel),
  );
}

function questions(interview: Interview): HTMLElement {
  return el('section', { class: 'panel' },
    el('h3', {}, 'Questions to ask them'),
    el('p', {}, 'Written before the day. Nobody thinks of a good one on the spot — pick three.'),
    editable(interview, 'questions', 'One per line'),
  );
}

/** A field that saves as you leave it. There is no save button because there is
 *  nothing to hold back, and a note lost to a forgotten button is a note lost. */
function editable(interview: Interview, field: 'people' | 'questions' | 'notes', placeholder: string): HTMLElement {
  const box = el('textarea', { rows: '5', placeholder, 'aria-label': placeholder });
  box.value = interview[field];
  on(box, 'change', () => {
    void window.cairn.interviews.save({ ...interview, [field]: box.value });
  });
  return box;
}

function checklist(interview: Interview): HTMLElement {
  const panel = el('section', { class: 'panel' },
    el('h3', {}, 'Before it starts'),
    el('p', {}, 'Ticked off as you go. Struck through rather than removed, so the list still reads as what you decided to do.'));

  const list = el('div', { class: 'checks' });
  const items = [
    'Re-read the role description',
    'Test the camera and microphone',
    'Read your own notes on them',
    'Have your questions somewhere you can see',
    'Know what you will say about pay',
  ];

  const draw = (done: string[]): void => {
    clear(list);
    for (const item of items) {
      const ticked = done.includes(item);
      const box = el('button', {
        class: `check${ticked ? ' done' : ''}`, type: 'button',
        role: 'checkbox', 'aria-checked': String(ticked),
      }, item);
      on(box, 'click', () => {
        const next = ticked ? done.filter((d) => d !== item) : [...done, item];
        void window.cairn.interviews.save({ ...interview, prepared: next }).then(() => draw(next));
      });
      list.append(box);
    }
  };
  draw(interview.prepared);
  panel.append(list);
  return panel;
}

/** The rest of the diary, with the ones that have already happened kept apart.
 *  An interview is not a deadline: it does not become overdue, it took place — and
 *  saying "Overdue by 12 days" about a conversation reads as a call you missed. */
function others(all: Interview[], current: Interview, now = new Date()): HTMLElement {
  const rest = all.filter((i) => i.id !== current.id && i.outcome === 'scheduled');
  const panel = el('section', { class: 'panel' }, el('h3', {}, 'The rest of the diary'));
  if (rest.length === 0) {
    panel.append(el('p', {}, 'Nothing else in the diary.'));
    return panel;
  }

  const passed = (i: Interview): boolean => Date.parse(i.at) < now.getTime();
  const ahead = rest.filter((i) => !passed(i));
  const behind = rest.filter(passed);

  const line = (interview: Interview, when: string): HTMLElement =>
    el('div', { class: 'frow' },
      el('div', {},
        el('label', {}, interview.round || 'Interview'),
        el('small', {}, `${when} · ${new Date(interview.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)));

  if (ahead.length > 0) {
    panel.append(el('h4', {}, 'Still to come'));
    for (const interview of ahead) {
      // Pressing one prepares for it. Only the next could be prepared for, which is no
      // use in a week with two in it.
      const row = el('button', { class: 'pickiv', type: 'button' }, line(interview, readableDue(interview.at)));
      on(row, 'click', () => { preparing = interview.id; refresh(); });
      panel.append(row);
    }
  }
  if (behind.length > 0) {
    panel.append(el('h4', {}, 'Already happened'));
    for (const interview of behind) {
      panel.append(line(interview,
        new Date(interview.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })));
    }
  }
  return panel;
}

/** The one place a date can be added, named and reachable. */
function toApplications(): HTMLElement {
  const button = el('button', { class: 'btn solid', type: 'button' }, 'Go to your applications');
  on(button, 'click', () => goTo('applications'));
  return button;
}
