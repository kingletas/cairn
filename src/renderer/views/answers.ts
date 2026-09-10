/** The answer bank. */

import { clear, el, on, saying } from '../components/dom.js';
import { refresh } from './app.js';
import type { AnswerBankEntry } from '../../shared/types.js';
import { ask } from '../components/ask.js';

interface Intent { id: string; prompt: string; kind: AnswerBankEntry['kind']; terms: string[] }

export async function renderAnswers(body: HTMLElement): Promise<void> {
  const [entries, intents, assistant] = await Promise.all([
    window.cairn.answers.list(),
    window.cairn.answers.intents() as Promise<Intent[]>,
    window.cairn.assistant.get(),
  ]);

  // Reading a form is the thing this screen is for, and it is useless until there are
  // answers to offer -- its own subtitle said so while sitting at the top of the page.
  // What you have to do first goes first.
  body.append(writtenPanel(entries));
  const started = entries.filter((entry) => entry.answer.trim().length === 0);
  if (started.length > 0) body.append(startedPanel(started, assistant.ready));
  body.append(unwrittenPanel(entries, intents));
  body.append(matchPanel(entries.length));
}

/** Paste a form, see what Cairn can answer. Nothing is filled in and nothing is
 *  submitted -- this is a list to work down with the form open beside it. */
function matchPanel(bankSize: number): HTMLElement {
  const paste = el('textarea', {
    id: 'formpaste', rows: '4',
    placeholder: 'Select the whole application page in your browser, copy it, and paste it here.',
  });
  const results = el('div', { class: 'matches' });
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const submit = el('button', { class: 'btn solid', type: 'submit' }, 'Read this form');

  const form = el('form', {}, paste, problem, submit);

  on(form, 'submit', (event) => {
    event.preventDefault();
    problem.hidden = true;
    clear(results);
    if (paste.value.trim().length === 0) return;

    void window.cairn.answers.readForm(paste.value).then((fields) => {
      if (fields.length === 0) {
        problem.textContent =
          'No form fields in that. Select the whole page rather than using View Source — ' +
          'view source gives the page before it finished loading, which on most job sites is empty.';
        problem.hidden = false;
        return;
      }
      const answered = fields.filter((f) => f.suggestion !== null).length;
      results.append(
        el('p', { class: 'lede' },
          `${fields.length} ${fields.length === 1 ? 'field' : 'fields'}. ` +
          `Cairn has something for ${answered} of them; the rest are yours to write.`),
      );
      for (const { field, suggestion } of fields) results.append(matchRow(field.label, field.kind, suggestion));
    }).catch((error: unknown) => {
      problem.textContent = saying(error);
      problem.hidden = false;
    });
  });

  return el('section', { class: 'panel' },
    el('h3', {}, 'Answer a form'),
    el('p', {},
      bankSize === 0
        ? 'Write a few answers below first — with an empty bank there is nothing to offer you.'
        : 'Paste an application page and Cairn will say which of your answers it is asking for. It fills nothing in and sends nothing.'),
    form, results);
}

function matchRow(
  label: string,
  kind: string,
  suggestion: { entry: AnswerBankEntry; score: number; how: string; because: string } | null,
): HTMLElement {
  if (suggestion === null) {
    return el('div', { class: 'match blank' },
      el('div', {}, el('label', {}, label), el('small', {}, `${kind} · nothing in your bank matches this`)));
  }

  const copy = el('button', { class: 'btn', type: 'button' }, 'Copy');
  on(copy, 'click', () => {
    void navigator.clipboard.writeText(suggestion.entry.answer).then(() => {
      copy.textContent = 'Copied';
      // The count only moves when an answer is actually used. It is the one figure
      // that says whether the bank is earning its keep.
      void window.cairn.answers.used(suggestion.entry.id);
      window.setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
    });
  });

  return el('div', { class: 'match' },
    el('div', {},
      el('label', {}, label),
      el('small', { class: suggestion.how === 'wording' ? 'hedged' : '' }, suggestion.because),
      el('p', { class: 'answertext' }, suggestion.entry.answer)),
    copy);
}

function writtenPanel(entries: AnswerBankEntry[]): HTMLElement {
  const written = entries.filter((entry) => entry.answer.trim().length > 0);
  const panel = el('section', { class: 'panel' }, el('h3', {}, 'My answers'));

  if (written.length === 0) {
    panel.append(el('p', {}, 'Nothing written yet. The questions below are the ones forms ask most; answering one takes a minute and saves it every time after.'));
    return panel;
  }

  const reused = written.reduce((sum, entry) => sum + entry.usedCount, 0);
  panel.append(el('p', {},
    `${written.length} written, used ${reused} ${reused === 1 ? 'time' : 'times'} between them.`));

  for (const entry of written) panel.append(editor(entry));
  return panel;
}

/** Questions Cairn knows forms ask, that nobody has answered here yet. Offered as
 *  prompts rather than pre-filled, because an answer nobody wrote is worse than a
 *  blank field. */
function unwrittenPanel(entries: AnswerBankEntry[], intents: Intent[]): HTMLElement {
  const have = new Set(entries.map((entry) => entry.intent).filter(Boolean));
  const missing = intents.filter((intent) => !have.has(intent.id));

  const panel = el('section', { class: 'panel' },
    el('h3', {}, 'Worth answering'),
    el('p', {}, 'These come up on almost every form. Cairn ships the questions and none of the answers.'));

  if (missing.length === 0) {
    panel.append(el('p', {}, 'You have written something for every question Cairn knows about.'));
    return panel;
  }

  for (const intent of missing) {
    const start = el('button', { class: 'btn', type: 'button' }, 'Write one');
    on(start, 'click', () => {
      void window.cairn.answers
        .create(intent.prompt, intent.id, intent.kind)
        .then(refresh);
    });
    panel.append(
      el('div', { class: 'frow' }, el('div', {}, el('label', {}, intent.prompt)), start),
    );
  }
  return panel;
}

/** Questions somebody has opened and not answered. Without this panel they were in
 *  neither list: written filters them out, and worth-answering counts them as held. */
function startedPanel(entries: AnswerBankEntry[], assistant: boolean): HTMLElement {
  const panel = el('section', { class: 'panel' },
    el('h3', {}, 'Open, and not answered yet'),
    el('p', {}, `${entries.length} ${entries.length === 1 ? 'question is' : 'questions are'} waiting on you.`));
  for (const entry of entries) panel.append(editor(entry, assistant));
  return panel;
}

function editor(entry: AnswerBankEntry, assistant = false): HTMLElement {
  const text = entry.kind === 'long'
    ? el('textarea', { rows: '3' })
    : el('input', { type: 'text' });
  text.value = entry.answer;

  const saved = el('span', { class: 'saved', hidden: true }, 'Saved');
  on(text, 'change', () => {
    void window.cairn.answers.save({ ...entry, answer: text.value }).then(() => {
      saved.hidden = false;
      window.setTimeout(() => { saved.hidden = true; }, 1400);
    });
  });

  const remove = el('button', { class: 'btn ghost', type: 'button' }, 'Delete');
  on(remove, 'click', () => {
    void window.cairn.answers.remove(entry.id).then(refresh);
  });

  const row = el('div', { class: 'answer' },
    el('div', { class: 'answerhead' },
      el('label', {}, entry.question),
      el('span', { class: 'pill' },
        entry.usedCount === 0 ? 'Not used yet' : `Used ${entry.usedCount}×`),
      saved, remove),
    text);

  // Only where there is nothing written and a provider to ask. The suggestion lands in
  // the box for editing and is never written into the bank by the assistant.
  if (assistant && entry.answer.trim() === '') {
    const suggest = el('button', { class: 'btn ghost', type: 'button' }, 'Suggest one');
    on(suggest, 'click', () => {
      suggest.setAttribute('disabled', 'true');
      void ask('suggest-answer', entry.id).then((result) => {
        suggest.removeAttribute('disabled');
        if (result === null) return;
        text.value = result.text;
        text.focus();
      });
    });
    row.append(el('div', { class: 'answeract' }, suggest,
      el('small', {}, 'Nothing is saved until you leave the box.')));
  }

  return row;
}
