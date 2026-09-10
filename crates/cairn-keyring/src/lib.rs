//! Passphrase handling for Cairn.
//!
//! This crate exists for one reason: JavaScript cannot promise that a key is gone.
//! Strings are immutable, the collector moves them, and nothing can prove the bytes
//! were overwritten. Locking the vault has to mean the key is unrecoverable from
//! this process, so the key is born here, lives here, and is wiped here.
//!
//! What this protects against: a copy of the database leaving the machine -- a backup
//! drive, a sync folder, a directory pointed somewhere unintended -- and a disk read
//! outside a running session.
//!
//! What it does not protect against: anything running as this user while the vault is
//! unlocked. The key is in this process's memory because the database needs it. Locking
//! is what shortens that window, and it is the only thing that does.

use argon2::{Algorithm, Argon2, Params, Version};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rand::Rng;
use std::sync::Mutex;
use zeroize::Zeroize;

/// Argon2id parameters. Memory-hard is the point: PBKDF2 falls to a GPU in a way
/// this does not. 64 MiB and three passes costs roughly a fifth of a second on a
/// laptop, which is unnoticeable at unlock and expensive at scale for an attacker.
const MEMORY_KIB: u32 = 65_536;
const PASSES: u32 = 3;
const LANES: u32 = 1;
const KEY_LEN: usize = 32;
const SALT_LEN: usize = 16;

/// The unlocked key, held for as long as the vault is open and not a moment longer.
static KEY: Mutex<Option<Vec<u8>>> = Mutex::new(None);

fn argon2() -> Result<Argon2<'static>> {
    let params = Params::new(MEMORY_KIB, PASSES, LANES, Some(KEY_LEN))
        .map_err(|e| Error::from_reason(format!("argon2 parameters rejected: {e}")))?;
    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

/// A fresh 16-byte salt, hex encoded. Stored beside the vault in plain sight --
/// a salt is not a secret, it only has to be unique.
#[napi]
pub fn new_salt() -> String {
    let mut salt = [0u8; SALT_LEN];
    rand::rng().fill_bytes(&mut salt);
    hex::encode(salt)
}

/// Derive the vault key from a passphrase and hold it. Returns the key as hex for the
/// database to open with, and keeps its own copy so `lock` has something to wipe.
///
/// The passphrase argument is zeroed before this returns, so the only copy that outlives
/// the call is the caller's -- which is why the caller passes it once and never stores it.
#[napi]
pub fn unlock(passphrase: String, salt_hex: String) -> Result<String> {
    let salt = hex::decode(&salt_hex)
        .map_err(|_| Error::from_reason("the salt is not hex; the vault header is damaged"))?;
    if salt.len() != SALT_LEN {
        return Err(Error::from_reason(format!(
            "the salt is {} bytes, expected {SALT_LEN}; the vault header is damaged",
            salt.len()
        )));
    }

    let mut secret = passphrase.into_bytes();
    let mut key = vec![0u8; KEY_LEN];
    let outcome = argon2()?.hash_password_into(&secret, &salt, &mut key);
    secret.zeroize();

    outcome.map_err(|e| Error::from_reason(format!("derivation failed: {e}")))?;

    let hex_key = hex::encode(&key);
    let mut held = KEY
        .lock()
        .map_err(|_| Error::from_reason("the key lock is poisoned"))?;
    if let Some(old) = held.as_mut() {
        old.zeroize();
    }
    *held = Some(key);
    Ok(hex_key)
}

/// Wipe the key. Safe to call when nothing is held, so a lock-on-idle timer never
/// has to ask first.
#[napi]
pub fn lock() -> Result<()> {
    let mut held = KEY
        .lock()
        .map_err(|_| Error::from_reason("the key lock is poisoned"))?;
    if let Some(mut key) = held.take() {
        key.zeroize();
    }
    Ok(())
}

/// Whether a key is currently held. The status bar reads this rather than tracking
/// its own idea of the lock state, so the two can never disagree.
#[napi]
pub fn is_unlocked() -> Result<bool> {
    Ok(KEY
        .lock()
        .map_err(|_| Error::from_reason("the key lock is poisoned"))?
        .is_some())
}

/// The parameters in force, for the lock screen to print. Stated rather than assumed,
/// so a change to the constants above cannot leave the interface claiming the old ones.
#[napi(object)]
pub struct KdfParams {
    pub algorithm: String,
    pub memory_kib: u32,
    pub passes: u32,
    pub lanes: u32,
}

#[napi]
pub fn kdf_params() -> KdfParams {
    KdfParams {
        algorithm: "Argon2id".into(),
        memory_kib: MEMORY_KIB,
        passes: PASSES,
        lanes: LANES,
    }
}
