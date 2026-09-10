import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

/** The key module, whichever platform it was built for. */
const require = createRequire(import.meta.url);
const keyring = require('../../native/' + readdirSync('native').find((n) => n.endsWith('.node')));

test('a passphrase and salt derive the same key they always have', () => {
  // Reference answers from the Argon2 C implementation, with the parameters below. A
  // dependency upgrade that changed either would lock every existing vault.
  const known = [
    ['correct horse battery staple', '00112233445566778899aabbccddeeff',
      'c63a7e80f29a251ff0f1067c51d08ff12594199c5d2bd4a51d95348f3a205883'],
    ['', 'ffeeddccbbaa99887766554433221100',
      'd68e3795adf585c35e58864284b1369a548444845c2add93afa6c7e4075f33d7'],
  ];
  try {
    for (const [passphrase, salt, key] of known) {
      assert.equal(keyring.unlock(passphrase, salt), key);
    }
  } finally {
    keyring.lock();
  }
  assert.deepEqual(keyring.kdfParams(),
    { algorithm: 'Argon2id', memoryKib: 65536, passes: 3, lanes: 1 });
});

test('locking wipes the key, and locking twice is harmless', () => {
  keyring.unlock('a passphrase for one test', keyring.newSalt());
  assert.equal(keyring.isUnlocked(), true);
  keyring.lock();
  keyring.lock();
  assert.equal(keyring.isUnlocked(), false);
});

test('a salt is sixteen fresh random bytes', () => {
  const salts = new Set(Array.from({ length: 64 }, () => keyring.newSalt()));
  assert.equal(salts.size, 64, 'two salts repeated');
  for (const salt of salts) assert.match(salt, /^[0-9a-f]{32}$/);
});

test('a damaged salt is refused rather than derived from', () => {
  assert.throws(() => keyring.unlock('x', 'not hex'), /not hex/);
  assert.throws(() => keyring.unlock('x', '0011'), /2 bytes, expected 16/);
  assert.equal(keyring.isUnlocked(), false);
});
