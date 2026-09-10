/** A provider key, sealed by the operating system's own keychain before it is written
 *  into the vault. Two locks rather than one, and Cairn holds neither. */

import { safeStorage } from 'electron';

/** Backends that are a keychain. Anything else on Linux is a fixed phrase standing in
 *  for one, which is not a lock and must not be described as one. */
const REAL = new Set(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']);

export interface Sealing {
  ok: boolean;
  backend: string;
  because: string;
}

/** Whether this machine can seal a key, and in plain words why not.
 *  It fails closed: an unrecognised backend is refused rather than trusted. */
export function sealing(): Sealing {
  if (!safeStorage.isEncryptionAvailable()) {
    return {
      ok: false, backend: 'none',
      because: 'This machine has no keychain Cairn can reach, so there is nowhere safe to put a key.',
    };
  }
  const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend() : process.platform;
  if (process.platform === 'linux' && !REAL.has(backend)) {
    return {
      ok: false, backend,
      because: 'Your desktop is standing in for a keychain with a fixed phrase, which is not a lock. '
        + 'Set up GNOME Keyring or KWallet and Cairn will use it.',
    };
  }
  return { ok: true, backend, because: '' };
}

export function seal(key: string): string {
  const state = sealing();
  if (!state.ok) throw new Error(state.because);
  return safeStorage.encryptString(key).toString('base64');
}

/** The key back, or nothing. A sealed value this machine cannot open is the normal
 *  result of moving a vault between machines, and it is said rather than thrown. */
export function unseal(sealed: string): string | null {
  if (sealed === '') return null;
  try {
    return safeStorage.decryptString(Buffer.from(sealed, 'base64'));
  } catch {
    return null;
  }
}
