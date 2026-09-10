/** The lock screen. */

import { clear, el, on, saying } from '../components/dom.js';
import { restart } from '../restart.js';
import type { VaultStatus } from '../../shared/types.js';

/** What to do about a vault this version cannot read. Written as steps because the
 *  order matters: writing the file out has to happen on the version that can. */
function steps(): HTMLElement {
  return el('ol', { class: 'recover' },
    el('li', {}, 'Install the Cairn you were using before, and open it.'),
    el('li', {}, 'Use Vault & privacy → Write everything out, and keep that file.'),
    el('li', {}, 'Come back here and set this vault aside.'),
    el('li', {}, 'Choose a passphrase, then read that file back in.'),
    el('li', {}, 'Delete the file you wrote out — it is not encrypted.'));
}

/** The way forward, because without it the instructions above cannot be followed: the
 *  app would show this screen for ever with no route to a vault you can import into.
 *  It moves the old vault to a folder beside this one and deletes nothing. */
function setAside(problem: HTMLElement): HTMLElement {
  const button = el('button', { class: 'btn', type: 'button' }, 'Set this vault aside');
  on(button, 'click', () => {
    button.setAttribute('disabled', 'true');
    void window.cairn.vault.startOver()
      .then((result) => {
        // Anything but a cancellation means the world changed, so the screen is redrawn
        // from what is actually there rather than from what it believed a moment ago.
        if (result.outcome === 'cancelled') { button.removeAttribute('disabled'); return; }
        restart();
      })
      .catch((error: unknown) => {
        button.removeAttribute('disabled');
        problem.textContent = saying(error);
        problem.hidden = false;
      });
  });
  return el('div', { class: 'lockact' }, button);
}

export function renderLock(root: HTMLElement, status: VaultStatus, onUnlocked: () => void): void {
  const passphrase = el('input', { type: 'password', id: 'pass', autocomplete: 'current-password' });
  const problem = el('p', { class: 'problem', role: 'alert', hidden: true });
  const form = el(
    'form', {},
    el('label', { for: 'pass' }, 'Passphrase'),
    passphrase,
    problem,
    el('button', { class: 'btn solid', type: 'submit' }, 'Unlock'),
  );

  on(form, 'submit', (event) => {
    event.preventDefault();
    problem.hidden = true;
    window.cairn.vault
      .unlock(passphrase.value)
      .then(() => { passphrase.value = ''; onUnlocked(); })
      .catch((error: unknown) => {
        problem.textContent = saying(error);
        problem.hidden = false;
        passphrase.select();
      });
  });

  // Said before anybody types: the format is in the header, which needs no key. The form
  // goes away rather than greying out, because a dead field still reads as the thing to try.
  const behind = status.format.onDisk !== null && status.format.onDisk < status.format.readable;

  const kdf = status.kdf;
  clear(root);
  root.append(
    el(
      'div',
      { class: 'curtain', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Vault locked' },
      el(
        'div', { class: 'card' },
        el('h1', {}, behind ? 'This vault needs one step first' : 'Vault locked'),
        el('p', {}, behind
          ? 'It was written by an earlier Cairn, whose encrypted file format this version ' +
            'cannot read. Nothing is lost and nothing has been changed — the version that ' +
            'wrote it can still open it.'
          : 'Enter your passphrase to open your records.'),
        ...(behind ? [steps(), problem, setAside(problem)] : [form]),
        kdf
          ? el('p', { class: 'hint' },
              `${kdf.algorithm} · ${kdf.passes} passes · ${Math.round(kdf.memoryKib / 1024)} MB`)
          : el('p', { class: 'hint' }, 'Key module unavailable'),
      ),
    ),
  );
  passphrase.focus();
}
