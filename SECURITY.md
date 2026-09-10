# Security

## Reporting something

Open a [private security advisory](https://github.com/kingletas/cairn/security/advisories/new) rather than a public issue. You will get a reply within a week.

## What Cairn defends

Cairn keeps a résumé, a pay figure, a list of employers somebody would rather avoid, and a record of where they have applied. It's a single-user desktop application with no server and no account.

**It protects against a copy of the vault leaving the machine** — a backup drive, a sync folder, a cloud directory pointed somewhere unintended — and **against a disk read outside a running session**.

**It does not protect against anything running as that user while the vault is unlocked.** The key is in the process's memory because the database needs it there. Locking shortens that window and is the only thing that does.

## How

| | |
|---|---|
| Database | SQLite through SQLite3 Multiple Ciphers, ChaCha20-Poly1305, one key per page. Never plaintext on disk, including while running. |
| Key derivation | Argon2id, 64 MiB, three passes, from the user's passphrase and a 16-byte salt stored beside the vault. |
| Key handling | Derived and held in `crates/cairn-keyring`, zeroed on lock. JavaScript cannot promise a key is gone; that is the only reason this crate exists. |
| Renderer | Context isolation on, node integration off, a Content-Security-Policy with no remote origins, and navigation blocked. A link opens in the user's own browser. |
| Network | One function makes every request. Nothing is scheduled until the user schedules it, and every request is recorded and counted where they can see it. |
| Provider keys | Sealed with `safeStorage`, the operating system's own keychain, before the ciphertext is written into the encrypted vault. Locked twice, and Cairn holds neither lock. On Linux the `basic_text` backend is refused rather than used: it is a fixed phrase standing in for a keychain, and calling it a lock would be the lie. |
| The assistant | Only ever asked by a person pressing a button. The request is built in the main process and held there; the interface receives a ticket, never a payload, so what is sent is exactly what was shown. A ticket is spent once. |

## Known limits, stated rather than left to be discovered

- **A forgotten passphrase cannot be recovered.** There is no reset, no escrow and no recovery key. This is the trade for having no account.
- **The salt is stored beside the vault in plain text.** A salt is not a secret; it only has to be unique.
- **Cairn does not defend against a compromised machine.** A keylogger sees the passphrase. Full-disk encryption and a locked screen do work Cairn cannot.
- **Postings are fetched over the public internet.** The host you fetch from learns your IP. The **Identify as** setting controls what else it learns.
- **A provider you bring sees what you send it.** That is the whole of the arrangement, and it is why every request is shown in full first. A posting, a résumé skeleton, your name and the skills you listed are what the four tasks carry; your passphrase is not reachable from any of them, and nothing about a provider is sent to anybody else.
- **A model on your own machine is reached over plain http.** `localhost` and `127.0.0.1` are the only exception to https, because there is no network between the two ends. Everything else is refused, including a hostname that merely contains the word.
- **Cairn cannot tell a true claim about you from a plausible one.** A drafted letter arrives with its checkable sentences listed beside it, and it is still yours to check. What Cairn does enforce is that a fact read out of a posting carries a quote that is really in the posting, and that a research note names a source for every sentence or is refused whole.
