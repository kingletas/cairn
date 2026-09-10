/** First run. */

import { clear, el, on } from '../components/dom.js';
import type { Profile } from '../../shared/types.js';

interface FamilyDefault { id: string; label: string; titles: string[] }
interface Defaults { families: { families: FamilyDefault[] } }

export function renderSetup(
  root: HTMLElement,
  options: { stage: 'create' | 'profile'; onDone: () => void },
): void {
  if (options.stage === 'create') renderCreate(root, options.onDone);
  else void renderProfile(root, options.onDone);
}

function curtain(...children: (Node | string)[]): HTMLElement {
  const card = el('div', { class: 'card' }, ...children);
  return el('div', { class: 'curtain' }, card);
}

function steps(done: number, total: number): HTMLElement {
  return el(
    'div',
    { class: 'steps' },
    ...Array.from({ length: total }, (_, i) => el('span', { 'data-done': String(i < done) })),
  );
}

function renderCreate(root: HTMLElement, onDone: () => void): void {
  const passphrase = el('input', { type: 'password', id: 'pass', autocomplete: 'new-password' });
  const again = el('input', { type: 'password', id: 'again', autocomplete: 'new-password' });
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const submit = el('button', { class: 'btn solid', type: 'submit' }, 'Create the vault');

  const form = el(
    'form', {},
    el('label', { for: 'pass' }, 'Choose a passphrase'),
    passphrase,
    el('label', { for: 'again' }, 'Type it again'),
    again,
    problem,
    submit,
  );

  on(form, 'submit', (event) => {
    event.preventDefault();
    problem.hidden = true;
    if (passphrase.value !== again.value) {
      problem.textContent = 'Those two do not match.';
      problem.hidden = false;
      return;
    }
    if (passphrase.value.length < 10) {
      problem.textContent = 'Use at least ten characters. This is the only thing between your records and a copied disk.';
      problem.hidden = false;
      return;
    }
    window.cairn.vault
      .create(passphrase.value)
      .then(() => window.cairn.vault.unlock(passphrase.value))
      .then(() => { passphrase.value = ''; again.value = ''; onDone(); })
      .catch((error: unknown) => {
        problem.textContent = String(error instanceof Error ? error.message : error);
        problem.hidden = false;
      });
  });

  clear(root);
  root.append(
    curtain(
      steps(0, 2),
      el('h1', {}, 'Set up Cairn'),
      el(
        'p', {},
        'Everything Cairn keeps lives in one encrypted file on this machine. There is no account and nothing to sign in to. ' +
          'This passphrase unlocks that file, and nobody can reset it for you — if you lose it, the records are gone.',
      ),
      form,
      el('p', { class: 'hint' }, 'Argon2id · ChaCha20-Poly1305'),
    ),
  );
  passphrase.focus();
}

async function renderProfile(root: HTMLElement, onDone: () => void): Promise<void> {
  const defaults = (await window.cairn.setup.defaults()) as Defaults;
  const families = defaults.families.families;
  const chosen = new Set<string>();

  const name = el('input', { type: 'text', id: 'name', autocomplete: 'off' });
  const floor = el('input', { type: 'number', id: 'floor', min: '0', step: '1000' });
  const currency = el('select', { id: 'currency' },
    ...['USD', 'GBP', 'EUR', 'CAD', 'AUD'].map((c) => el('option', {}, c)));
  const skills = el('input', { type: 'text', id: 'skills', placeholder: 'Comma separated' });
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });

  const chips = el('div', { class: 'chips' });
  for (const family of families) {
    const chip = el('button', { type: 'button', 'aria-pressed': 'false' }, family.label);
    on(chip, 'click', () => {
      const now = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', String(now));
      if (now) chosen.add(family.id); else chosen.delete(family.id);
    });
    chips.append(chip);
  }

  const submit = el('button', { class: 'btn solid', type: 'submit' }, 'Finish setup');
  const form = el(
    'form', {},
    el('label', { for: 'name' }, 'What should Cairn call you?'),
    name,
    el('label', {}, 'Which kinds of work are you looking for?'),
    chips,
    el('label', { for: 'currency' }, 'Currency'),
    currency,
    el('label', { for: 'floor' }, 'Lowest pay you would consider (optional)'),
    floor,
    el('label', { for: 'skills' }, 'Skills worth counting in a posting (optional)'),
    skills,
    problem,
    submit,
  );

  on(form, 'submit', (event) => {
    event.preventDefault();
    problem.hidden = true;
    if (name.value.trim().length === 0 || chosen.size === 0) {
      problem.textContent = 'Cairn needs a name to call you and at least one kind of work, or its screens have nothing to compare against.';
      problem.hidden = false;
      return;
    }
    const profile: Profile = {
      displayName: name.value.trim(),
      locations: [],
      remoteOnly: false,
      currency: currency.value,
      payFloor: floor.value === '' ? null : Number(floor.value),
      payTarget: null,
      skills: skills.value.split(',').map((s) => s.trim()).filter(Boolean),
      families: [...chosen],
      workAuthorisation: null,
      needsSponsorship: null,
    };
    window.cairn.profile
      .save(profile)
      .then(onDone)
      .catch((error: unknown) => {
        problem.textContent = String(error instanceof Error ? error.message : error);
        problem.hidden = false;
      });
  });

  clear(root);
  root.append(
    curtain(
      steps(1, 2),
      el('h1', {}, 'A little about the search'),
      el(
        'p', {},
        'Cairn compares every posting it finds against what you say here. Nothing is sent anywhere — ' +
          'these answers stay in the vault you just made, and you can change any of them later.',
      ),
      form,
    ),
  );
  name.focus();
}
