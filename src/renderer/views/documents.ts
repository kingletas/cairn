/** Letters: pick a skeleton, fill it in, and get the file an employer receives. */

import { clear, el, on, saying } from '../components/dom.js';
import { refresh } from './app.js';
import type { DocumentRecord, DocumentVersion, Opportunity } from '../../shared/types.js';
import { ask } from '../components/ask.js';
import * as mask from '../mask.js';

interface Template { id: string; name: string; use: string; body: string; slots: string[] }
interface Refusal { reason: string; found: string }

const SLOT_LABELS: Record<string, string> = {
  company: 'Company', role: 'Role', your_name: 'Your name',
  hiring_manager: 'Hiring manager, if you know it',
  opening_hook: 'Opening — why you, in one sentence',
  evidence_one: 'Something you did that is relevant',
  evidence_two: 'A second thing, if it earns its place',
  why_them: 'Why this company rather than another',
  referrer: 'Who referred you', referrer_context: 'How you know them',
  from_field: 'What you did before', carries_across: 'What carries across',
};

export async function renderDocuments(body: HTMLElement): Promise<void> {
  const [templates, documents, roles, assistant] = await Promise.all([
    window.cairn.letters.templates() as Promise<Template[]>,
    window.cairn.documents.list(),
    window.cairn.opportunities.list(),
    window.cairn.assistant.get(),
  ]);
  const versions = (await Promise.all(documents.map((d) => window.cairn.documents.versions(d.id)))).flat();
  body.append(resumes(documents.filter((d) => d.kind === 'resume'), versions));
  body.append(composer(templates, roles, assistant.ready));
  body.append(library(documents.filter((d) => d.kind === 'cover-letter')));
}

const FORMAT_NOTE: Record<DocumentRecord['format'], string> = {
  pdf: 'PDF',
  markdown: 'Markdown — Cairn can read this one',
  docx: 'Word document',
  other: 'Cairn cannot read this format, only attach it',
};

/** Résumés, and which one goes out by default. */
function resumes(documents: DocumentRecord[], versions: DocumentVersion[]): HTMLElement {
  const panel = el('section', { class: 'panel' }, el('h3', {}, 'Résumés'));

  const add = el('button', { class: 'btn solid', type: 'button' }, 'Add a résumé');
  on(add, 'click', () => {
    void window.cairn.documents.import('resume').then((record) => {
      if (record !== null) refresh();
    });
  });

  if (documents.length === 0) {
    panel.append(
      el('p', {},
        'None yet. Add the one you send most — Cairn copies it into the vault rather than ' +
        'linking to it, so the file that went to an employer is still the file you have.'),
      add);
    return panel;
  }

  panel.append(
    el('p', {},
      'The default is attached when you mark an application sent, and Cairn records which ' +
      'one went with it. Six weeks later that is unanswerable otherwise, and it is the first ' +
      'thing an interviewer asks about.'));

  for (const record of documents) {
    const note = el('input', { type: 'text', placeholder: 'When to use this one' });
    note.value = record.note;
    on(note, 'change', () => {
      void window.cairn.documents.save({ ...record, note: note.value });
    });

    const makeDefault = record.isDefault
      ? el('span', { class: 'pill live' }, 'Default')
      : el('button', { class: 'btn', type: 'button' }, 'Make default');
    if (!record.isDefault) {
      on(makeDefault as HTMLElement, 'click', () => {
        void window.cairn.documents.setDefault(record.id, 'resume').then(refresh);
      });
    }

    // A newer file behind the same record, keeping the one it replaces. An application
    // recorded the file that went, so overwriting it would change what was sent.
    const replace = el('button', { class: 'btn ghost', type: 'button' }, 'Replace');
    replace.title = 'Point this at a newer file. The one it replaces is kept.';
    on(replace, 'click', () => {
      replace.setAttribute('disabled', 'true');
      void window.cairn.documents.replace(record.id)
        .then((done) => { replace.removeAttribute('disabled'); if (done !== null) refresh(); });
    });

    const reveal = el('button', { class: 'btn ghost', type: 'button' }, 'Show file');
    on(reveal, 'click', () => { void window.cairn.documents.reveal(record.id); });

    // Removes the record and never the file. A résumé that went to an employer is the
    // only copy of what they read, and this was written and then never offered.
    const forget = el('button', { class: 'btn ghost', type: 'button' }, 'Forget');
    forget.title = 'Removes it from this list. The file itself stays in your vault.';
    on(forget, 'click', () => {
      forget.setAttribute('disabled', 'true');
      void window.cairn.documents.forget(record.id).then(refresh);
    });

    panel.append(
      el('div', { class: 'docrow' },
        el('div', {},
          el('label', {}, record.title),
          el('small', { class: 'path' },
            `${record.relativePath}${record.held === 'linked' ? ' — linked, not in your vault' : ''}`),
          el('small', {},
            `${FORMAT_NOTE[record.format]} · ` +
            (record.usedCount === 0 ? 'not sent with anything yet'
              : `sent with ${record.usedCount} ${record.usedCount === 1 ? 'application' : 'applications'}`)),
          note),
        el('div', { class: 'docacts' }, makeDefault, replace, reveal, forget)),
    );
    const past = versions.filter((v) => v.documentId === record.id);
    if (past.length > 0) panel.append(versionList(past));
  }

  panel.append(add);
  return panel;
}

/** What a document used to be. Listed rather than hidden: an application says which
 *  file went, and this is where that file still is. */
function versionList(versions: DocumentVersion[]): HTMLElement {
  const list = el('div', { class: 'versions' });
  for (const version of versions) {
    const show = el('button', { class: 'linkbtn', type: 'button' }, 'Show file');
    on(show, 'click', () => { void window.cairn.documents.revealVersion(version.documentId, version.id); });
    list.append(el('p', { class: 'planline' },
      `Replaced ${new Date(version.replacedAt).toLocaleDateString()} · `,
      el('span', { class: 'path' }, version.relativePath),
      ' · ', show));
  }
  return list;
}

function composer(templates: Template[], roles: Opportunity[], assistant: boolean): HTMLElement {
  const panel = el('section', { class: 'panel' }, el('h3', {}, 'Write a letter'));
  if (templates.length === 0) {
    panel.append(el('p', {}, 'No templates found.'));
    return panel;
  }

  const picker = el('select', { 'aria-label': 'Template' },
    ...templates.map((t) => el('option', { value: t.id }, t.name)));
  const use = el('p', { class: 'templateuse' });
  const slots = el('div', { class: 'slots' });
  const draft = el('textarea', { rows: '14', 'aria-label': 'The letter' });
  const verdict = el('div', { class: 'verdict' });
  const output = el('p', { class: 'output', hidden: true, role: 'status' });

  const values: Record<string, string> = {};
  let current = templates[0] as Template;

  const checkDraft = (): void => {
    clear(verdict);
    void window.cairn.letters.check(draft.value).then(({ refusals, sendable }) => {
      renderVerdict(verdict, refusals, sendable);
      send.toggleAttribute('disabled', !sendable);
    });
  };

  const rebuild = (): void => {
    clear(slots);
    use.textContent = current.use;
    for (const slot of current.slots) {
      const field = el('input', { type: 'text', id: `slot-${slot}` });
      field.value = values[slot] ?? '';
      on(field, 'input', () => { values[slot] = field.value; });
      slots.append(
        el('div', { class: 'frow' },
          el('div', {}, el('label', { for: `slot-${slot}` }, SLOT_LABELS[slot] ?? slot)), field),
      );
    }
  };

  const build = el('button', { class: 'btn', type: 'button' }, 'Build the draft');
  on(build, 'click', () => {
    void window.cairn.letters.fill(current.id, values).then((result) => {
      draft.value = result.letter;
      renderVerdict(verdict, result.refusals, result.sendable, result.unfilled);
      send.toggleAttribute('disabled', !result.sendable);
    });
  });

  const claims = el('div', { class: 'asked', hidden: true });
  // Present only when there is a provider and something to write about, rather than
  // sitting there disabled: a button that cannot work is a question nobody answers.
  const drafting = assistant && roles.length > 0 ? draftWithAssistant(roles, () => current, (letter, check) => {
    draft.value = letter;
    clear(claims);
    claims.hidden = check.length === 0;
    if (check.length > 0) {
      claims.append(el('h4', {}, 'Check these before it goes'));
      for (const sentence of check) claims.append(el('p', {}, sentence));
    }
    checkDraft();
  }) : null;

  const company = el('input', { type: 'text', id: 'lettercompany', placeholder: 'Company' });
  const send = el('button', { class: 'btn solid', type: 'button', disabled: 'true' }, 'Save as PDF');
  on(send, 'click', () => {
    output.hidden = false;
    output.textContent = 'Rendering…';
    void window.cairn.letters
      .render(draft.value, company.value || values['company'] || '', false)
      .then(({ record, check: rendered }) => {
        output.textContent =
          `Saved as ${record.relativePath} — ${rendered.pages} page, ` +
          `and Cairn read it back to check the letter is on it.`;
      })
      .catch((error: unknown) => {
        output.textContent = saying(error);
      });
  });

  on(picker, 'change', () => {
    current = templates.find((t) => t.id === picker.value) ?? current;
    rebuild();
  });
  on(draft, 'input', checkDraft);

  rebuild();
  panel.append(
    el('div', { class: 'frow' }, el('div', {}, el('label', {}, 'Template'), use), picker),
    slots, build);
  if (drafting !== null) panel.append(drafting);
  panel.append(
    el('h4', { class: 'draftlabel' }, 'The letter'),
    draft, claims, verdict,
    el('div', { class: 'frow' },
      el('div', {}, el('label', { for: 'lettercompany' }, 'Save it under'),
        el('small', {}, 'Used for the filename, inside the vault.')),
      company),
    send, output,
  );
  return panel;
}

/** A first draft from the assistant, into the editor and nowhere else. It is never
 *  saved by this, and the guard that decides whether a letter may render is unchanged. */
function draftWithAssistant(
  roles: Opportunity[],
  template: () => Template,
  landed: (letter: string, check: string[]) => void,
): HTMLElement {
  const picker = el('select', { 'aria-label': 'Which role' },
    ...roles.map((one) => el('option', { value: one.id }, `${mask.company(one.company)} — ${one.role}`)));
  const button = el('button', { class: 'btn', type: 'button' }, 'Draft it with the assistant');

  on(button, 'click', () => {
    button.setAttribute('disabled', 'true');
    void ask('draft-letter', picker.value, template().id).then((result) => {
      button.removeAttribute('disabled');
      if (result !== null) landed(result.text, result.check);
    });
  });

  return el('div', { class: 'frow' },
    el('div', {},
      el('label', {}, 'Or have the assistant start it'),
      el('small', {}, 'Everything it asserts is yours to check.')),
    el('div', { class: 'inline' }, picker, button));
}

function renderVerdict(
  into: HTMLElement, refusals: Refusal[], sendable: boolean, unfilled: string[] = [],
): void {
  clear(into);
  if (unfilled.length > 0) {
    into.append(el('p', { class: 'notready' },
      `${unfilled.length} ${unfilled.length === 1 ? 'part is' : 'parts are'} still yours to write. ` +
      'Cairn leaves them showing rather than emptying them — a blank space where a company name should be is only obvious to somebody who already knows.'));
  }
  if (sendable) {
    into.append(el('p', { class: 'ready' }, 'Nothing in the way. This will render.'));
    return;
  }
  for (const refusal of refusals) {
    into.append(
      el('p', { class: 'notready' },
        `Not ready — ${refusal.reason}: `, el('code', {}, refusal.found)),
    );
  }
}

function library(documents: DocumentRecord[]): HTMLElement {
  const panel = el('section', { class: 'panel' }, el('h3', {}, 'Letters I have sent'));
  if (documents.length === 0) {
    panel.append(el('p', {}, 'Nothing written yet. A saved letter is the file an employer actually received, so Cairn will not overwrite one without being told to.'));
    return panel;
  }
  for (const record of documents) {
    panel.append(
      el('div', { class: 'frow' },
        el('div', {}, el('label', {}, record.title),
          el('small', { class: 'path' }, record.relativePath))),
    );
  }
  return panel;
}
