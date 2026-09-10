/** Settings. Every row here is a value a screen reads, so a setting and a check
 *  cannot disagree -- there is only one copy of each. Changes apply immediately;
 *  there is no Save button because there is nothing to hold back. */

import { clear, el, on, saying, words } from '../components/dom.js';
import { listField } from '../components/list-field.js';
import { sections } from '../components/sections.js';
import type { AssistantTask, Profile, Settings, Stage } from '../../shared/types.js';
import { ASSISTANT_TASKS, STAGES, STAGE_NAMES } from '../../shared/types.js';
import { applyAppearance, redrawRail, refresh, refreshCounts } from './app.js';
import { covered, phraseCount, phrasesBuiltAroundAValue } from '../i18n.js';
import { restart } from '../restart.js';

/** The four jobs, named the way the buttons that start them are named. */
const TASK_LABELS: Record<AssistantTask, string> = {
  'read-posting': 'Read this posting',
  'draft-letter': 'Draft a letter',
  'suggest-answer': 'Suggest an answer',
  research: 'Research this employer',
};

const TASK_NOTES: Record<AssistantTask, string> = {
  'read-posting': 'Sends the posting text and what you are looking for.',
  'draft-letter': 'Sends the skeleton, the posting and what you told Cairn about yourself.',
  'suggest-answer': 'Sends the question and answers you have already written.',
  research: 'Sends the employer name, and asks it to search.',
};

type Choice<K extends keyof Settings> = { value: Settings[K]; label: string };

function segmented<K extends keyof Settings>(
  settings: Settings, key: K, choices: Choice<K>[], after?: () => void,
): HTMLElement {
  const group = el('div', { class: 'seg', role: 'radiogroup' });
  for (const choice of choices) {
    const button = el('button', {
      type: 'button', role: 'radio',
      'aria-checked': String(settings[key] === choice.value),
    }, choice.label);
    on(button, 'click', () => {
      settings[key] = choice.value;
      void window.cairn.settings.set(key, choice.value);
      for (const sibling of Array.from(group.querySelectorAll('button'))) {
        sibling.setAttribute('aria-checked', String(sibling === button));
      }
      after?.();
    });
    group.append(button);
  }
  return group;
}

function row(label: string, description: string, control: HTMLElement): HTMLElement {
  return el('div', { class: 'frow' },
    el('div', {}, el('label', {}, label), description === '' ? null : el('small', {}, description)),
    control);
}

/** For a control that wants the whole width -- a list of chips reads badly squeezed
 *  into the column a single field sits in. */
function stacked(label: string, description: string, control: HTMLElement): HTMLElement {
  return el('div', { class: 'frow stacked' },
    el('div', {}, el('label', {}, label), description === '' ? null : el('small', {}, description)),
    control);
}

function toggle<K extends keyof Settings>(settings: Settings, key: K, label: string): HTMLElement {
  const button = el('button', {
    class: 'sw', type: 'button', 'aria-label': label,
    'aria-pressed': String(settings[key] === true),
  });
  on(button, 'click', () => {
    const next = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(next));
    settings[key] = next as Settings[K];
    void window.cairn.settings.set(key, next as Settings[K]);
  });
  return button;
}

/** A text field that saves when you leave it. There is no save button because there
 *  is nothing to hold back, and a value lost to a forgotten button is a value lost. */
function field(
  id: string, value: string, placeholder: string, save: (next: string) => void,
): HTMLInputElement {
  const input = el('input', { type: 'text', id, placeholder });
  input.value = value;
  on(input, 'change', () => save(input.value));
  return input;
}

function numberField(
  id: string, value: number | null, placeholder: string, save: (next: number | null) => void,
): HTMLInputElement {
  const input = el('input', { type: 'number', id, min: '0', step: '1000', placeholder });
  input.value = value === null ? '' : String(value);
  on(input, 'change', () => save(input.value === '' ? null : Number(input.value)));
  return input;
}

/** Whether the editor was open, so a save does not fold it away mid-edit. Every change
 *  here redrew the whole panel, which closed the disclosure and lost the reader's
 *  place -- on the one screen somebody sits and works through. */
let editorOpen = false;

/** Adding, renaming and retitling the families themselves, rather than only choosing
 *  from a list somebody else wrote.
 */
function familyEditor(
  list: Awaited<ReturnType<typeof window.cairn.families.get>>,
  profile: Profile,
  redraw: () => void,
): HTMLElement {
  const yours = new Set(list.yours);
  const draft = list.families.map((family) => ({ ...family, titles: [...family.titles] }));
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const rows = el('div', {});

  /** `redraw: false` for an edit that changes nothing anybody else on the screen is
   *  showing. Adding, removing or renaming a family changes the row of chips above, so
   *  those redraw; editing a family's titles does not, and redrawing for it would take
   *  the field out from under the person typing in it. */
  const save = (options: { replaceShipped?: boolean; redraw?: boolean } = {}): void => {
    problem.hidden = true;
    window.cairn.families
      .save(draft, options.replaceShipped ?? list.replaceShipped)
      .then(() => { if (options.redraw !== false) redraw(); })
      .catch((error: unknown) => {
        problem.textContent = saying(error);
        problem.hidden = false;
      });
  };

  /** What a family is and what it searches first, in one line. Rewritten in place when
   *  the titles change, so it can never describe the list as it was a moment ago. */
  const describe = (family: { id: string; titles: string[] }): string => {
    const where = yours.has(family.id) ? 'Yours' : 'Shipped sample';
    const first = family.titles[0];
    if (first === undefined) return `${where} · no titles, so nothing is searched or kept for it`;
    const rest = family.titles.length - 1;
    return `${where} · searched as “${first}” first` +
      (rest > 0 ? `, and ${rest} more ${rest === 1 ? 'title' : 'titles'} matched against` : '');
  };

  for (const family of draft) {
    const label = el('input', { type: 'text', 'aria-label': 'What this family is called' });
    label.value = family.label;
    on(label, 'change', () => { family.label = label.value; save(); });

    // The first title carries more weight than the rest, and how many there are decides
    // how wide the net is. Neither is obvious from a list of chips on its own.
    const meta = el('small', {}, describe(family));

    // One at a time, and each one visible. A comma-separated line is a list somebody
    // re-reads every time to see what is in it, and where a missing space quietly
    // makes two titles out of one -- which here means a search term nobody wrote.
    const titles = listField({
      id: `family-${family.id}`,
      placeholder: 'A job title',
      empty: 'No titles yet, so nothing is searched or kept for this family.',
      values: family.titles,
      save: (next) => {
        family.titles = next;
        meta.textContent = describe(family);
        save({ redraw: false });
      },
    });

    const remove = el('button', { class: 'btn ghost', type: 'button' },
      yours.has(family.id) ? 'Remove' : 'Hide');
    on(remove, 'click', () => {
      // By identity rather than by position: a row's index is only true until another
      // row is removed.
      const at = draft.indexOf(family);
      if (at >= 0) draft.splice(at, 1);
      save();
    });

    rows.append(
      el('div', { class: 'frow stacked' },
        el('div', {}, label, meta),
        el('div', { class: 'frow' }, titles, remove)),
    );
  }

  const newLabel = el('input', { type: 'text', id: 'newfamily', placeholder: 'Platform engineering' });
  const newTitles = el('input', { type: 'text', id: 'newtitles', placeholder: 'Platform Engineer' });
  const add = el('button', { class: 'btn', type: 'button' }, 'Add this family');
  on(add, 'click', () => {
    const label = newLabel.value.trim();
    const titles = newTitles.value.split(',').map((one) => one.trim()).filter(Boolean);
    if (label === '' || titles.length === 0) {
      problem.textContent = 'A family needs a name and at least one job title, or there is nothing to search for.';
      problem.hidden = false;
      return;
    }
    // From the name, so two families cannot quietly become one. A clash with something
    // already there gets a number rather than overwriting it.
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'family';
    const taken = new Set(draft.map((one) => one.id));
    let id = base;
    for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
    draft.push({ id, label, titles });
    save();
  });

  const onlyMine = el('button', {
    class: 'sw', type: 'button', 'aria-label': 'Use only my families',
    'aria-pressed': String(list.replaceShipped),
  });
  on(onlyMine, 'click', () => save({ replaceShipped: onlyMine.getAttribute('aria-pressed') !== 'true' }));

  const reset = el('button', { class: 'btn ghost', type: 'button' }, 'Back to the shipped sample');
  on(reset, 'click', () => { void window.cairn.families.reset().then(redraw); });

  const panel = el('details', { class: 'editor', ...(editorOpen ? { open: 'true' } : {}) },
    el('summary', {}, 'Edit these families'),
    el('p', {},
      'The list above is a sample and is meant to be outgrown. What you change here is saved in your vault, ' +
      'not in the app, and the first title of a family is the one a run searches first.'),
    el('p', {},
      'These titles are also what a run keeps. A posting whose title is none of them is set aside, and every ' +
      'run says how many that was — so if something you wanted never arrived, this is the list to widen.'),
    rows,
    el('div', { class: 'frow stacked' },
      el('div', {}, el('label', { for: 'newfamily' }, 'Add a family'),
        el('small', {}, 'A name, and its first job title.')),
      el('div', { class: 'frow' }, newLabel, newTitles, add)),
    row('Use only my families', 'Drop the shipped sample entirely, once your own list is the one you use.', onlyMine),
    problem,
    reset);

  on(panel, 'toggle', () => { editorOpen = panel.open; });

  if (profile.families.some((id) => !list.families.some((family) => family.id === id))) {
    panel.append(el('p', { class: 'planline blocked' },
      'One of the families you had picked is gone, so nothing is being searched for it.'));
  }
  return panel;
}

/** Everything the screens compare a posting against. */
/** The five stages are fixed; what they are called is not. Reordering them and adding
 *  one are a different question: three of the five do something rather than say
 *  something: one of them records a date and starts the clock on the silence. */
function stagesPanel(settings: Settings): HTMLElement {
  const panel = el('section', { class: 'panel' },
    el('h3', {}, 'What I call each stage'),
    el('p', {}, 'Cairn\u2019s words, unless you give it yours. Leave one blank to put Cairn\u2019s back. '
      + 'The five stages themselves stay, because three of them do something rather than say '
      + 'something — each row below says which.'));

  for (const stage of STAGES) {
    const name = el('input', {
      type: 'text', id: `stage-${stage}`, placeholder: STAGE_NAMES[stage],
    });
    name.value = settings.stageLabels[stage] ?? '';
    on(name, 'change', () => {
      const next = { ...settings.stageLabels };
      if (name.value.trim() === '') delete next[stage];
      else next[stage] = name.value.trim();
      settings.stageLabels = next;
      void window.cairn.settings.set('stageLabels', next).then(() => { refresh(); });
    });

    const swatches = el('div', { class: 'stageswatches', role: 'group', 'aria-label': `Colour for ${STAGE_NAMES[stage]}` });
    for (const from of STAGES) {
      const chosen = (settings.stageColours[stage] ?? stage) === from;
      const swatch = el('button', {
        type: 'button', class: 'stageswatch', 'data-stage': from,
        title: STAGE_NAMES[from], 'aria-pressed': String(chosen),
      });
      on(swatch, 'click', () => {
        const next = { ...settings.stageColours };
        if (from === stage) delete next[stage];
        else next[stage] = from;
        settings.stageColours = next;
        void window.cairn.settings.set('stageColours', next).then(() => {
          applyAppearance(settings);
          refresh();
        });
      });
      swatches.append(swatch);
    }

    panel.append(el('div', { class: 'frow' },
      el('div', {},
        el('label', { for: `stage-${stage}` }, STAGE_NAMES[stage]),
        el('small', {}, STAGE_NOTES[stage])),
      el('div', { class: 'inline' }, name, swatches)));
  }
  return panel;
}

const STAGE_NOTES: Record<Stage, string> = {
  considering: 'Where a lead lands when you keep it.',
  preparing: 'Yours entirely — nothing happens when a role reaches it.',
  applied: 'Records the date it went and starts the clock on the silence.',
  interviewing: 'Counted in the rail and on Today.',
  decision: 'The last stage, so nothing moves on from it.',
};


export async function renderProfile(body: HTMLElement): Promise<void> {
  const [profile, list, settings] = await Promise.all([
    window.cairn.profile.get(),
    window.cairn.families.get(),
    window.cairn.settings.get(),
  ]);
  const families = list.families;

  // Redrawn when the vault stored something other than what was sent -- three spellings
  // of one country go in and one comes back, and the screen has to say so.
  const save = (changes: Partial<Profile>): void => {
    Object.assign(profile, changes);
    void window.cairn.profile.save(profile).then((stored) => {
      const changed = JSON.stringify(stored) !== JSON.stringify(profile);
      Object.assign(profile, stored);
      if (changed) void renderProfile(body);
    });
  };

  const you = el('section', { class: 'panel' },
    el('h3', {}, 'Me'),
    el('p', {}, 'Nothing here leaves the vault. It is what every posting is compared against.'),
    row('My name', 'Appears nowhere except your own screen.',
      field('p-name', profile.displayName, 'Your name', (v) => save({ displayName: v }))),
    stacked('Where I am',
      'Used when a posting says something about location. A country is kept under one name, ' +
      'so US, USA and United States are the same place — and a posting is read for all of them.',
      listField({
        id: 'p-loc', placeholder: 'A city, or a country', empty: 'Anywhere',
        values: profile.locations, save: (next) => save({ locations: next }),
      })),
    row('Remote only', 'Anything asking you to be somewhere is flagged rather than hidden.',
      toggleValue(profile.remoteOnly, 'Remote only', (v) => save({ remoteOnly: v }))),
  );

  const work = el('section', { class: 'panel' },
    el('h3', {}, 'What I am looking for'),
    el('p', {}, 'These decide what Cairn searches for and which postings it screens out on the title.'));
  const chips = el('div', { class: 'chips light' });
  for (const family of families) {
    const chosen = profile.families.includes(family.id);
    const chip = el('button', { type: 'button', 'aria-pressed': String(chosen) }, family.label);
    on(chip, 'click', () => {
      const now = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(now));
      const next = now
        ? [...profile.families, family.id]
        : profile.families.filter((id) => id !== family.id);
      save({ families: next });
    });
    chips.append(chip);
  }
  work.append(chips);
  work.append(familyEditor(list, profile, () => void renderProfile(body)));

  /** Employers you refuse to work for. */
  const said = el('p', { class: 'planline', hidden: true, role: 'status' });
  const exclusions = el('section', { class: 'panel' },
    el('h3', {}, 'Employers I never want to see'),
    el('p', {},
      'A posting whose employer is one of these never reaches your queue. Where the name only ' +
      'turns up in the text of a posting somebody else listed — which is what an agency posting ' +
      'on their behalf looks like — the lead still arrives, flagged, with the sentence quoted, ' +
      'because a posting that merely mentions them reads the same way.'),
    stacked('Never show me these', 'Paste a list and Cairn will split it.',
      listField({
        id: 'p-excluded',
        placeholder: 'An employer’s name',
        empty: 'None. Every employer reaches your queue.',
        values: settings.excludedEmployers,
        save: (next) => {
          void window.cairn.employers.set(next).then((result) => {
            const refused = next.length - result.names.length;
            const lines = [
              result.dropped > 0
                ? `${result.dropped} waiting ${result.dropped === 1 ? 'lead' : 'leads'} set aside.`
                : '',
              refused > 0
                ? `${refused} ${refused === 1 ? 'entry was' : 'entries were'} not kept. An employer needs two characters, and one is only stored once however it is spelled — Red Heron, redheron and RED HERON are the same company.`
                : '',
            ].filter(Boolean);
            said.textContent = lines.join(' ');
            said.hidden = lines.length === 0;
            // The rail counts what is waiting, and several of them have just gone.
            if (result.dropped > 0) void refreshCounts();
            // Only when the list Cairn kept is not the list on the screen, so the two
            // can never sit there disagreeing about what is excluded.
            if (refused > 0) void renderProfile(body);
          });
        },
      })),
    said,
  );

  const money = el('section', { class: 'panel' },
    el('h3', {}, 'Pay'),
    el('p', {},
      'Two numbers, because one cannot say both “not worth reading” and “worth a look”. ' +
      'Below the floor a posting is dropped; between the two it survives and is flagged.'),
    row('Currency', '',
      selectValue(['USD', 'GBP', 'EUR', 'CAD', 'AUD'], profile.currency, 'Currency',
        (v) => save({ currency: v }))),
    row('Floor', '',
      numberField('p-floor', profile.payFloor, 'Leave blank to compare nothing',
        (v) => save({ payFloor: v }))),
    row('Target', '',
      numberField('p-target', profile.payTarget, 'Optional', (v) => save({ payTarget: v }))),
  );

  const skills = el('section', { class: 'panel' },
    el('h3', {}, 'Skills worth counting'),
    el('p', {},
      'Cairn counts how often each appears in a posting and shows you the numbers. ' +
      'It never decides what the count means — a technology named once in a list of ' +
      'requirements is a very different job from one named nine times.'),
    stacked('The ones to count', 'Paste a list and Cairn will split it.',
      listField({
        id: 'p-skills', placeholder: 'Kubernetes', empty: 'None yet — nothing is being counted.',
        values: profile.skills, save: (next) => save({ skills: next }),
      })),
  );

  const eligibility = el('section', { class: 'panel' },
    el('h3', {}, 'Eligibility'),
    el('p', {}, 'Answered once here, and offered by the answer bank whenever a form asks.'),
    row('Work authorisation',
      'Where you are allowed to work without help. A country on its own is kept under one ' +
      'name; a sentence is kept exactly as you wrote it, because a form will read it.',
      field('p-auth', profile.workAuthorisation ?? '', 'e.g. anywhere in the UK',
        (v) => save({ workAuthorisation: v.trim() === '' ? null : v }))),
    row('Needs sponsorship', 'Now or in the future.',
      toggleValue(profile.needsSponsorship === true, 'Needs sponsorship',
        (v) => save({ needsSponsorship: v }))),
  );

  clear(body);
  if (section === 'search') body.append(work, money, skills, exclusions, stagesPanel(settings));
  else body.append(you, eligibility);
}

function toggleValue(value: boolean, label: string, save: (next: boolean) => void): HTMLElement {
  const button = el('button', { class: 'sw', type: 'button', 'aria-label': label, 'aria-pressed': String(value) });
  on(button, 'click', () => {
    const next = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(next));
    save(next);
  });
  return button;
}

function selectValue(
  options: string[], value: string, label: string, save: (next: string) => void,
): HTMLElement {
  const select = el('select', { 'aria-label': label },
    ...options.map((o) => el('option', o === value ? { selected: 'selected' } : {}, o)));
  on(select, 'change', () => save(select.value));
  return select;
}

/** Settings is four short pages rather than one long one. */
type Section = 'you' | 'search' | 'fetching' | 'assistant' | 'app';

let section: Section = 'you';

function appearancePanel(settings: Settings): HTMLElement {
  return el('section', { class: 'panel' },
    el('h3', {}, 'Appearance'),
    el('p', {}, 'How Cairn looks. Stored with your settings, not with your records.'),
    row('Theme', 'Dark follows your desktop unless you pick one.',
      segmented(settings, 'theme',
        [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }],
        () => applyAppearance(settings))),
    // The four swatches at the foot of the rail are the fast way to change this and
    // carry no visible label, so this is the one that can be found by looking for it.
    row('Accent', 'Also the four dots at the foot of the rail.',
      segmented(settings, 'accent',
        [{ value: 'pine', label: 'Pine' }, { value: 'slate', label: 'Slate' },
         { value: 'mulberry', label: 'Mulberry' }, { value: 'olive', label: 'Olive' }],
        () => { applyAppearance(settings); redrawRail(); })),
    row('Mask for sharing',
      'Hides every employer and every figure, for a call. The rail carries the same switch, ' +
      'because this is not a thing anybody wants to go looking for.',
      toggleValue(settings.screenShare, 'Mask for sharing', (v) => {
        settings.screenShare = v;
        applyAppearance(settings);
        void window.cairn.settings.set('screenShare', v);
        refresh();
      })),
    row('Density', 'Compact fits about three more rows on screen.',
      segmented(settings, 'density',
        [{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }],
        () => applyAppearance(settings))),
    row('Roles per stage', '',
      segmented(settings, 'pipelinePageSize',
        [{ value: 10, label: '10' }, { value: 20, label: '20' },
         { value: 50, label: '50' }, { value: 100, label: '100' }])),
    row('Pipeline layout', 'A board shows every stage at once.',
      segmented(settings, 'pipelineLayout',
        [{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' },
         { value: 'board', label: 'Board' }])),
    row('Other lists', 'Leads, applications and preflight.',
      segmented(settings, 'listLayout',
        [{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }])),
    row('Weeks start on', '',
      segmented(settings, 'weekStartsOn',
        [{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }])),
    row('Text size', '',
      segmented(settings, 'textSize',
        [{ value: 'small', label: 'Small' }, { value: 'default', label: 'Default' }, { value: 'large', label: 'Large' }],
        () => applyAppearance(settings))),
  );
}

function fetchingPanel(settings: Settings): HTMLElement {
  return el('section', { class: 'panel' },
    el('h3', {}, 'Fetching'),
    el('p', {}, 'How Cairn fetches postings. Every request here is counted in the bar along the bottom.'),
    row('Check sources', 'Applies to sources set to the default schedule.',
      segmented(settings, 'harvestCadenceHours',
        [{ value: null, label: 'Only when I ask' }, { value: 6, label: 'Every 6 hours' },
         { value: 12, label: 'Twice a day' }, { value: 24, label: 'Once a day' }])),
    row('Wait between requests',
      'How long Cairn leaves between two requests to the same host. Longer is politer and slower; each host is spaced on its own, so this is not the length of a whole run.',
      segmented(settings, 'requestDelayMs',
        [{ value: 500, label: 'Half a second' }, { value: 1500, label: 'A second and a half' },
         { value: 3000, label: 'Three seconds' }])),
    row('One kind at a time',
      'Employer boards and listing sites are read side by side, because they are different hosts and each one is asked once every request delay either way. Turn this on to finish one kind before starting the other.',
      toggle(settings, 'sequentialFetch', 'One kind at a time')),
    row('Remember roles you dropped', 'Stores a hash of the link only, so the same posting stops coming back.',
      toggle(settings, 'keepDroppedHashes', 'Remember roles you dropped')),
    row('Identify as', 'What Cairn sends when it fetches a page.',
      segmented(settings, 'identifyAs',
        [{ value: 'cairn', label: 'Cairn' }, { value: 'generic', label: 'A browser' }, { value: 'nothing', label: 'Nothing' }])),
    row('Only rank pay an employer published', 'A figure from a listing site is still shown, and labelled.',
      toggle(settings, 'requireFirstPartyPay', 'Only rank first-party pay')),
    // Another screen that could drop a lead while saying "your limit" about a number
    // nobody had ever been asked for.
    row('Ignore postings older than', 'The role is usually gone by then.',
      segmented(settings, 'maxPostingAgeDays',
        [{ value: 7, label: '7 days' }, { value: 14, label: '14 days' },
         { value: 30, label: '30 days' }, { value: 90, label: '90 days' }])),
  );
}

function applicationsPanel(settings: Settings): HTMLElement {
  return el('section', { class: 'panel' },
    el('h3', {}, 'Chasing up'),
    el('p', {}, 'What happens after you send one. Cairn creates a reminder and sends nothing itself.'),
    row('Chase after', 'An application that goes quiet is the commonest way one ends.',
      segmented(settings, 'chaseAfterDays',
        [{ value: 7, label: '7 days' }, { value: 10, label: '10 days' },
         { value: 14, label: '14 days' }, { value: null, label: 'Never' }])),
  );
}

/** Looking for a newer Cairn, when asked. Nothing is scheduled and nothing installs
 *  itself: the app says what is published and the release page opens in your browser. */
/** The times of day are minutes from midnight everywhere else; here they are the two
 *  numbers somebody actually thinks in. */
function hourField(id: string, minutes: number, save: (next: number) => void): HTMLElement {
  const field = el('input', { type: 'time', id, step: '900' });
  const pad = (n: number): string => String(n).padStart(2, '0');
  field.value = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  on(field, 'change', () => {
    const [h, m] = field.value.split(':').map(Number);
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return;
    save(h * 60 + m);
  });
  return field;
}

/** One notice a day, or none. Off until somebody asks for it, like everything else
 *  here that acts on its own. */
/** What happens to a file you add. Copying is the default because it is the only one
 *  that keeps: a linked file is not encrypted, is not in an export, and is gone the
 *  moment somebody tidies their downloads folder. */
function documentsPanel(settings: Settings): HTMLElement {
  return el('section', { class: 'panel' },
    el('h3', {}, 'My files'),
    el('p', {},
      'A résumé or a document you add can be copied into the vault or left where it is. ' +
      'What Cairn already holds is not changed by this — it decides what happens to the next one.'),
    row('Copied or linked',
      'Copied is encrypted with everything else and travels in an export. Linked stays where ' +
      'it is on your disk: not encrypted, not in an export, and gone if you move it.',
      segmented(settings, 'documentsHeld',
        [{ value: 'copied', label: 'Copied in' }, { value: 'linked', label: 'Linked' }])));
}

function notifyPanel(settings: Settings): HTMLElement {
  const panel = el('section', { class: 'panel' },
    el('h3', {}, 'Alerts'),
    el('p', {},
      'One notice a day about what is due, from your own machine. Nothing is scheduled on ' +
      'a server and nothing leaves here to make it happen — five separate notifications ' +
      'about a job search is a channel people turn off, and the real one goes with it.'),
    row('A daily alert', 'Interviews today, anything due, and anything past due — in one.',
      toggleValue(settings.notify, 'A daily notice', (v) => {
        settings.notify = v;
        void window.cairn.settings.set('notify', v);
      })));

  const from = hourField('quiet-from', settings.quietFrom, (v) => {
    settings.quietFrom = v;
    void window.cairn.settings.set('quietFrom', v);
  });
  const to = hourField('quiet-to', settings.quietTo, (v) => {
    settings.quietTo = v;
    void window.cairn.settings.set('quietTo', v);
  });
  panel.append(
    el('div', { class: 'frow' },
      el('div', {},
        el('label', { for: 'quiet-from' }, 'Quiet from'),
        el('small', {}, 'Nothing is said between these. Set them the same for no quiet hours at all.')),
      from),
    el('div', { class: 'frow' },
      el('div', {}, el('label', { for: 'quiet-to' }, 'Quiet until')), to),
  );
  return panel;
}

function updatePanel(): HTMLElement {
  const button = el('button', { class: 'btn', type: 'button' }, 'Check now');
  const said = el('p', { class: 'planline', hidden: true });
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const open = el('button', { class: 'linkbtn', type: 'button' }, 'Open the release page');
  on(open, 'click', () => {
    void window.cairn.open.external('https://github.com/kingletas/cairn/releases/latest');
  });

  on(button, 'click', () => {
    button.setAttribute('disabled', 'true');
    problem.hidden = true;
    said.hidden = true;
    void window.cairn.vault
      .checkForUpdate()
      .then((found) => {
        button.removeAttribute('disabled');
        clear(said);
        if (found.newer === null) {
          said.append(words(`You are on ${found.running}, and ${found.published} is the newest published.`));
        } else {
          said.append(words(`${found.newer} is out; you are on ${found.running}. `), open);
        }
        said.hidden = false;
      })
      .catch((error: unknown) => {
        button.removeAttribute('disabled');
        problem.textContent = saying(error);
        problem.hidden = false;
      });
  });

  return el('section', { class: 'panel' },
    el('h3', {}, 'A newer Cairn'),
    el('p', {},
      'Cairn looks when you press this and never on its own — one request, listed in ' +
      'What has left this machine like every other. It downloads nothing and installs ' +
      'nothing; a new version is something you fetch and run yourself.'),
    el('div', { class: 'frow' },
      el('div', {},
        el('label', {}, 'Check for a newer version'),
        el('small', {}, 'Reaches api.github.com, and nothing else.')),
      button),
    problem, said);
}

function lockingPanel(settings: Settings): HTMLElement {
  return el('section', { class: 'panel' },
    el('h3', {}, 'Locking'),
    el('p', {}, 'Locking wipes the key from memory. Unlocking derives it again from your passphrase.'),
    row('Lock when idle', 'Also locks on suspend and when your screen locks.',
      segmented(settings, 'lockAfterMinutes',
        [{ value: 5, label: '5 min' }, { value: 15, label: '15 min' },
         { value: 60, label: '1 hour' }, { value: null, label: 'Only when I ask' }])),
  );
}

/** Bring your own provider. Nothing here is on until a key and a model are in, and
 *  nothing is ever sent without the panel that shows what leaves. */
/** Which language the interface is in. Cairn says how much of it a catalogue covers
 *  rather than implying all of it: a language that is most of the way there is a
 *  different promise from one that is done, and the rest shows in English. */
async function languagePanel(host: HTMLElement, settings: Settings): Promise<void> {
  const [available, said] = await Promise.all([
    window.cairn.language.list(),
    window.cairn.language.phrases(),
  ]);

  const picker = el('select', { id: 'lang', 'aria-label': 'Language' });
  for (const one of available) {
    picker.append(el('option', {
      value: one.code, selected: one.code === settings.language,
    }, one.shipped ? one.name : `${one.name} — yours`));
  }
  on(picker, 'change', () => {
    void window.cairn.settings.set('language', picker.value).then(() => restart());
  });

  const open = el('button', { class: 'btn ghost', type: 'button' }, 'Open the folder');
  on(open, 'click', () => { void window.cairn.language.folder(); });

  const known = phraseCount();
  const done = covered(said.phrases, known);

  host.append(el('section', { class: 'panel' },
    el('h3', {}, 'Language'),
    el('p', {}, 'Every phrase is written in English, and a catalogue is a file of those '
      + 'phrases in another language. Anything it does not carry shows in English rather '
      + 'than as a blank, so a language is useful before it is finished.'),
    row('Show Cairn in', 'The window is drawn again when you change this.', picker),
    settings.language === 'en'
      ? el('p', { class: 'planline' }, 'English is what the phrases are written in, so nothing is looked up.')
      : el('p', { class: 'planline' },
          `This one covers ${done}% of the ${known} phrases a catalogue can carry.`,
          phrasesBuiltAroundAValue() === 0
            ? ''
            : ` A further ${phrasesBuiltAroundAValue()} could not be written as a phrase, so they stay English in every language.`),
    el('p', { class: 'planline' }, 'This setting lives in the vault, so until you unlock it the '
      + 'lock screen follows the language this machine is set to.'),
    row('Your own catalogues', 'Drop a file named for its language code into lang/ in your vault. '
      + 'Yours is laid over the shipped one, so a single line is a whole change.', open),
  ));
}


async function assistantPanel(host: HTMLElement): Promise<void> {
  const [presets, lock, current] = await Promise.all([
    window.cairn.assistant.presets(),
    window.cairn.assistant.sealing(),
    window.cairn.assistant.get(),
  ]);

  const redraw = (): void => { clear(host); void assistantPanel(host); };
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const said = el('p', { class: 'planline', role: 'status', hidden: true });
  const complain = (error: unknown): void => {
    problem.textContent = saying(error);
    problem.hidden = false;
  };

  if (!lock.ok) {
    host.append(el('section', { class: 'panel' },
      el('h3', {}, 'An assistant'),
      el('p', {}, 'Cairn can ask a model you bring to read a posting, draft a letter, suggest an '
        + 'answer or look an employer up. It sends nothing without showing you first.'),
      el('p', { class: 'problem' }, lock.because),
      el('p', {}, 'Cairn will not hold a key it cannot lock, so this stays off until then.')));
    return;
  }

  const provider = current.provider ?? {
    id: presets[0]?.id ?? 'custom',
    kind: presets[0]?.kind ?? 'openai-compatible',
    base: presets[0]?.base ?? '',
    model: presets[0]?.model ?? '',
    keyHeld: false,
    effort: 'high' as const,
    quiet: [],
    addedAt: '',
  };

  const chooser = el('select', { id: 'a-provider' });
  for (const preset of presets) {
    const option = el('option', { value: preset.id, selected: preset.id === provider.id }, preset.label);
    chooser.append(option);
  }
  const base = el('input', { type: 'text', id: 'a-base', placeholder: 'https://api.example.com' });
  base.value = provider.base;

  on(chooser, 'change', () => {
    const preset = presets.find((one) => one.id === chooser.value);
    if (preset === undefined) return;
    base.value = preset.base;
    void window.cairn.assistant
      .save({ ...provider, id: preset.id, kind: preset.kind, base: preset.base, model: preset.model }, null)
      .then(redraw)
      .catch(complain);
  });
  on(base, 'change', () => {
    void window.cairn.assistant.save({ ...provider, base: base.value }, null).then(redraw).catch(complain);
  });

  const key = el('input', { type: 'password', id: 'a-key', placeholder: provider.keyHeld ? 'A key is held' : 'Paste your key' });
  const saveKey = el('button', { class: 'btn', type: 'button' }, 'Save the key');
  on(saveKey, 'click', () => {
    problem.hidden = true;
    void window.cairn.assistant
      .save(provider, key.value)
      .then(() => { key.value = ''; redraw(); })
      .catch(complain);
  });

  const models = el('select', { id: 'a-model' });
  models.append(el('option', { value: provider.model }, provider.model === '' ? 'No model chosen' : provider.model));
  const askModels = el('button', { class: 'btn', type: 'button' }, 'Ask it which models it offers');
  on(askModels, 'click', () => {
    askModels.setAttribute('disabled', 'true');
    problem.hidden = true;
    void window.cairn.assistant.models()
      .then((found) => {
        askModels.removeAttribute('disabled');
        clear(models);
        models.append(el('option', { value: '' }, 'No model chosen'));
        for (const one of found) {
          models.append(el('option', { value: one.id, selected: one.id === provider.model }, one.label));
        }
        said.textContent = `${found.length} to choose from.`;
        said.hidden = false;
      })
      .catch((error: unknown) => { askModels.removeAttribute('disabled'); complain(error); });
  });
  on(models, 'change', () => {
    void window.cairn.assistant.save({ ...provider, model: models.value }, null).then(redraw).catch(complain);
  });

  const efforts = el('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'How hard it works' });
  for (const level of ['low', 'medium', 'high'] as const) {
    const button = el('button', {
      type: 'button', role: 'radio', 'aria-checked': String(provider.effort === level),
    }, level === 'low' ? 'Quick' : level === 'medium' ? 'Middling' : 'Careful');
    on(button, 'click', () => {
      void window.cairn.assistant.save({ ...provider, effort: level }, null).then(redraw).catch(complain);
    });
    efforts.append(button);
  }

  const quiet = el('div', {});
  for (const task of ASSISTANT_TASKS) {
    const button = el('button', {
      class: 'sw', type: 'button', 'aria-label': `Send ${TASK_LABELS[task]} without showing me`,
      'aria-pressed': String(provider.quiet.includes(task)),
    });
    on(button, 'click', () => {
      const next = provider.quiet.includes(task)
        ? provider.quiet.filter((one) => one !== task)
        : [...provider.quiet, task];
      void window.cairn.assistant.save({ ...provider, quiet: next }, null).then(redraw).catch(complain);
    });
    quiet.append(row(TASK_LABELS[task], TASK_NOTES[task], button));
  }

  const forget = el('button', { class: 'btn danger', type: 'button' }, 'Forget this provider');
  on(forget, 'click', () => {
    void window.cairn.assistant.forget().then(redraw).catch(complain);
  });

  host.append(
    el('section', { class: 'panel' },
      el('h3', {}, 'An assistant'),
      el('p', {}, 'A model you bring, doing four jobs Cairn cannot do with a rule: reading a '
        + 'posting for what it actually says, drafting a letter, suggesting an answer, and looking '
        + 'an employer up. It decides nothing — everything it returns is yours to keep or throw away.'),
      el('p', {}, `Your key is sealed by this machine's own keychain (${lock.backend}) before it is `
        + 'written into the vault, so it is locked twice and Cairn holds neither lock.'),
      row('Provider', 'Two protocols cover the market.', chooser),
      row('Where requests go', 'Plain http is refused, except to a model on this machine.', base),
      row('Key', provider.keyHeld ? 'A key is held. Paste a new one to replace it.' : 'Nothing is sent until this is in.',
        el('div', { class: 'inline' }, key, saveKey)),
      row('Model', 'Asked of your provider rather than a list Cairn ships and has to keep true.',
        el('div', { class: 'inline' }, models, askModels)),
      row('How hard it works', 'Older models do not offer this and will say so if you pick one.', efforts),
      current.ready
        ? el('p', { class: 'ready' }, 'Set up. The four buttons are on the screens they belong to.')
        : el('p', { class: 'notready' },
            'Not set up yet — nothing above is saved until you change it, and Cairn will not '
            + 'offer the assistant anywhere until a key and a model are in.'),
      problem, said),
    current.ready ? el('section', { class: 'panel' },
      el('h3', {}, 'Sending without being shown'),
      el('p', {}, 'Every request is shown to you in full before it goes. Turn one of these on and '
        + 'that task stops asking — it still appears in the run log with everything you would have seen.'),
      quiet) : el('div', { hidden: true }),
    current.provider === null ? el('div', { hidden: true }) : el('section', { class: 'panel danger' },
      el('h3', {}, 'Remove it'),
      el('p', {}, 'Forgets the provider and the sealed key. Nothing you have already kept is touched.'),
      forget),
  );
}

export function renderSettings(body: HTMLElement, settings: Settings): void {
  sections({
    body,
    label: 'Settings sections',
    showing: section,
    remember: (id) => { section = id; },
    defs: [
      { id: 'you', label: 'Me', draw: (host) => renderProfile(host) },
      { id: 'search', label: 'My search', draw: (host) => renderProfile(host) },
      { id: 'fetching', label: 'Fetching', draw: (host) => { host.append(fetchingPanel(settings)); } },
      { id: 'assistant', label: 'Assistant', draw: (host) => assistantPanel(host) },
      {
        id: 'app',
        label: 'The app',
        draw: (host) => {
          host.append(appearancePanel(settings));
          void languagePanel(host, settings);
          host.append(applicationsPanel(settings),
            lockingPanel(settings), documentsPanel(settings), notifyPanel(settings),
            updatePanel());
        },
      },
    ],
  });
}
