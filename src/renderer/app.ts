/** The interface. */

import { renderSetup } from './views/setup.js';
import { renderLock } from './views/lock.js';
import { renderApp } from './views/app.js';
import { onRestart } from './restart.js';
import { setPhraseCount, useLanguage } from './i18n.js';

const found = document.getElementById('root');
if (!found) throw new Error('The window has no root element.');
const root: HTMLElement = found;

export async function boot(): Promise<void> {
  // Before anything is drawn. The setting lives in the vault, so until it opens the lock
  // and setup screens follow the language the machine is set to.
  const said = await window.cairn.language.phrases();
  useLanguage(said.code, said.phrases);
  setPhraseCount(said.known, said.notYet);

  const status = await window.cairn.vault.status();

  if (!status.exists) {
    renderSetup(root, { stage: 'create', onDone: () => void boot() });
    return;
  }
  if (!status.unlocked) {
    renderLock(root, status, () => void boot());
    return;
  }
  const complete = await window.cairn.setup.isComplete();
  if (!complete) {
    renderSetup(root, { stage: 'profile', onDone: () => void boot() });
    return;
  }
  await renderApp(root, status);
}

onRestart(() => void boot());

// The vault can lock without anybody pressing anything -- the idle timer, suspend, the
// screen locking -- and a window still showing records after the key is wiped is the
// one thing this app must not do.
window.cairn.vault.onLocked(() => void boot());

// Any interaction is a sign somebody is still here, so the idle lock waits.
for (const event of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(event, () => void window.cairn.vault.touch(), { passive: true });
}

void boot();
