# Cairn

[![CI](https://github.com/kingletas/cairn/actions/workflows/ci.yml/badge.svg)](https://github.com/kingletas/cairn/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Looking for work means keeping track of forty things at once across six websites, none of which talk to each other, while the only record of what you have already applied for is your own memory and a browser history.** Cairn is one place for that, on your own machine.

A cairn is the stack of stones people build on a long walk so the next person — usually themselves, three weeks later — can tell where the path went.

## What it does

- **Keeps every role you are chasing in one list**, grouped by how far along it is, each one carrying the next thing you have to do.
- **Reads job feeds you turn on** — Greenhouse, Lever, Ashby and SmartRecruiters boards, plus four open listing sites — and screens what comes back against what you said you want.
- **Reads a feed it has never heard of.** A listing site is an address and a list of what its fields are called, so it is a file rather than a release. Write one, or take somebody else's, and import it.
- **Shows its working.** Every screen quotes the sentence it read. When a posting says you have to be in an office two days a week, Cairn shows you that sentence rather than a verdict.
- **Refuses to decide the things you should decide.** Whether a role fits, whether the location really works, and whether a technology is the job or a line in the requirements are left to you, with the evidence on screen.
- **Remembers the answers you write** to the questions every application form asks, so the fifth one takes minutes instead of an hour.
- **Asks a model you bring, if you want one.** Bring a key from Anthropic, OpenAI, Gemini, Mistral or a model running on your own machine, and Cairn can read a posting for what a rule cannot, draft a letter, suggest an answer or look an employer up. It ships no key, reaches nothing until you set one up, and **shows you every request in full before it goes**.

## What it does not do

- **No account, no server, no sync.** Your records live in one encrypted file on your machine.
- **No fetching you did not ask for.** Nothing is on a schedule until you put it on one, and the bar along the bottom counts every request Cairn has made today.
- **No sending your search anywhere.** Rules run on your machine, after a posting has been fetched.
- **No telemetry, no crash reporting, no fonts from a CDN.** A font request is a network request.
- **In your language, if somebody has written one.** Spanish, French and Portuguese ship; a catalogue is one file of phrases and yours goes in your vault. Anything untranslated shows the English it was written in, so a language is useful before it is finished.
- **No assistant of its own.** There is no model built in and no service behind Cairn. If you want one you bring your own key, and it never decides whether a role fits — that is yours.

## Screens and privacy

Cairn holds a résumé, a salary figure and a list of employers you would rather avoid. That is worth being precise about.

| | |
|---|---|
| **At rest** | ChaCha20-Poly1305, one key per database page. The file is never plaintext on disk, including while Cairn is open. |
| **The key** | Argon2id from your passphrase, held in a small Rust module, wiped when you lock. JavaScript cannot promise a key is gone; that is the only reason any Rust is here. |
| **Locking** | On request, after an idle period you choose, and when your machine suspends or your screen locks. |
| **Paths** | Every path shown is relative to Cairn's own folder. A screenshot of this app is safe to paste into an issue. |

**What that protects against:** a copy of the file leaving your machine — a backup drive, a sync folder, a directory pointed somewhere unintended — and a disk read outside a running session.

**What it does not protect against:** anything running as you while the vault is unlocked. The key has to be in memory for the database to work. Locking is what shortens that window, and it is the only thing that does.

**If you bring an assistant**, its key is sealed by your operating system's own keychain before it is written into the vault, so it's locked twice and Cairn holds neither lock. On Linux, a desktop standing in for a keychain with a fixed phrase is refused rather than used, and Cairn says so.

Every request to a provider goes through the same gate a job board does and is counted in the same bar. Each one is listed twice: once as a request, once as a question, both in **Vault & privacy**.

## Getting started

**Build it from this repository.** You need **Node 22.12 or newer**, a **Rust toolchain**, and a **C compiler**.

```bash
git clone https://github.com/kingletas/cairn.git
```

```bash
cd cairn && make deps && make install
```

That builds it and puts a `cairn` command on your PATH, with a desktop entry so it shows up in your applications. Run it:

```bash
cairn
```

Cairn opens on a setup screen, because a fresh install has nothing in it. You choose a passphrase, say what kind of work you're looking for, and everything after that is yours.

`cairn --rebuild` builds again after a `git pull`, `cairn --where` prints where the code and your vault live, and `make uninstall` removes the launcher without touching the vault.

**There are no ready-made installers yet.** When a release is published it will carry an AppImage, a `.deb`, an `.rpm`, a `.dmg` for each kind of Mac and a Windows installer, none of them signed; [docs/installing.md](docs/installing.md) says which file to take and how to get past each warning.

Until then, `make package` writes installers for the machine you're on into `release/`. It builds only for that machine: the Rust key module and the database binding are compiled against the host and neither cross-builds, which is why a release is built once on each operating system.

If the graphics driver takes the window down, Cairn starts again without the graphics card, remembers, and says so. `cairn --try-graphics` undoes that and `cairn --crashes` prints what it recorded. Both work whether you installed a package or built it here.

**Upgrading an existing install?** [docs/upgrading.md](docs/upgrading.md) carries every change that asks something of you, and Cairn says so on the lock screen when one applies.

**A longer walkthrough, written for somebody who has never seen this before, is in [docs/from-nothing.md](docs/from-nothing.md).**

**Why this exists at all, and what it refuses to do, is [docs/why.md](docs/why.md).**

## What ships with it

Cairn arrives knowing how to read job boards, and knowing nothing about you.

| Shipped | Not shipped |
|---|---|
| Four employer board readers and four public listing sites, all switched off | Any employer list — you add boards by pasting a careers-page URL |
| A sample taxonomy of job families and common titles | Your pay floor, your location, your skills, and the families you actually search |
| A source pack you can copy and edit to read any other feed | Any feed that needs an account, a key or a subscription |
| Three cover letter skeletons and two résumé skeletons | Anything filled in, and your own files — those are copied in, never invented |
| The questions application forms ask over and over | The answers, which are yours |

## Adding a feed

The listing sites Cairn ships with are in [defaults/sources.json](defaults/sources.json), and it is a plain file rather than code: an address with `{query}` where the search term goes, and a map saying what the fields in the answer are called.

**You do not have to open it.** On the Sources screen, **Write a feed** asks for the address and what the fields are called; **Make it mine** opens a shipped feed in the same form so you can change it. Your version is saved in your vault beside the original rather than over it, so removing yours brings the shipped one back. **Import a source pack** takes the same thing as a file, which is how you would send one to somebody else.

Three things the format cannot do, all on purpose:

- **It cannot hold a credential.** There is nowhere to put a key, because a file meant to be shared is the worst place one can sit. A feed that needs an account is a feed Cairn does not read.
- **It cannot switch itself on.** Importing a pack never causes a request. A new feed arrives switched off like every other, and the Sources screen shows you which host it would reach before you turn it on.
- **It cannot take over a feed already there,** or promote its own figures. A pay range is only read when the feed says the employer published it; a listing site's own estimate is dropped, because an estimate that ranks a role is a number nobody said.

**Your own feeds live in your vault folder, never here** — that is the point of them being files. The same goes for the job families you search: the shipped list is a sample, **Settings → My search → Edit these families** writes your own, and **Use only my families** drops the sample once your list is the one you use.

## Building on it

`make help` lists everything. `make check` is what a commit has to pass: the design tokens, TypeScript, ESLint, `cargo fmt`, Clippy, and the test suite.

**Every colour, size and space in the app is one file**: [defaults/theme/cairn.json](defaults/theme/cairn.json). Change a value, run `make theme`, and it reaches the whole app — component stylesheets carry no colour literal, no bare pixel type size and no fourth radius, and `make check` fails if one appears. A hardcoded colour is a theme that silently does not switch, and the only way to notice is to look at all four.

## Licence

MIT. See [LICENSE](LICENSE).
