# Contributing

Thanks for looking. Cairn is a desktop app that holds somebody's job search, so most of what follows is about not leaking it.

## Getting set up

You need Node 22.12 or newer, a Rust toolchain and a C compiler.

```bash
make deps && make build
```

`make help` lists the rest. `make run` starts the app against a vault in your own user data directory — it will not touch anything you already have.

## Before you open a pull request

```bash
make check
```

You get the design token check, TypeScript, ESLint, `cargo fmt`, Clippy and the tests. All of it has to pass before you open a pull request.

## What CI runs, and what it does not

**Only Linux runs on a push or a pull request.** It checks, builds and tests everything.

**macOS and Windows do not.** GitHub bills a macOS minute at ten and a Windows minute at two, so a three-platform matrix on every push and every dependabot pull request costs about thirteen minutes of the allowance for every one minute of work. It emptied a month of them in a fortnight, and the release that followed could not publish.

They still run in two places:

- **On the release tag.** The release builds and tests on all three, so a break on macOS or Windows fails the release rather than reaching anybody.
- **By hand, before tagging.** Run the *CI* workflow from the Actions tab — or `gh workflow run ci.yml` — when a change touches the native side: the Rust key module, the database binding, the launcher, or anything about paths and filenames. Those are the parts compiled against the host, and a green Linux build says nothing about them.

**If you are working in a fork, this costs you nothing to know** — your own allowance is what pays for your runs, and the same arithmetic applies to it.

## Four rules that are not style preferences

**Nothing fetches around the gate.** Every outbound request goes through `fetchThrough` in `src/main/net/gate.ts`, which counts it and records it. The count in the status bar is the app's central claim about itself, and there is a test that fails the build if a second call site appears.

**No colour literal, no bare pixel type size, no fourth radius in component CSS.** Everything reads a token from `defaults/theme/cairn.json`, which is the whole theme — change a value there and run `make theme` to rebuild `src/renderer/styles/tokens.css`, which is generated and never edited by hand. A hardcoded colour is a theme that silently does not switch, and the only way to find one is to look at all four themes — so the build looks instead.

**Nothing ships that describes a person.** Cairn arrives with feeds, templates and a job taxonomy. It arrives with no employer list, no pay figures, no exclusions and no answers. `tests/unit/defaults.test.js` enforces that, and it is the test to read before adding anything to `defaults/`.

**A pure function does not share a module with anything that imports `electron`.** This
has cost two rounds now: the PDF check and the filename cleaner were both untestable
because something three imports away reached `electron`, which does not exist outside
the app. Put the logic in its own module and let the Electron-facing one call it. A
check nothing can run is a check nobody has.

**Native modules are built for Electron, and the tests run there too.** The database is
a native binding compiled for one runtime's ABI, and Electron's is not the system
Node's. `npm run build` rebuilds it; `npm test` runs on Electron's own Node. This is
not a preference — a suite run on plain Node passes while the app cannot open a vault
at all, and nothing says so until somebody tries to use it. `tests/unit/runtime.test.js`
is what says so now.

**A native module is replaced, never rewritten in place.** A running Cairn has both
native modules mapped. Truncating a mapped file makes the kernel throw away the running
process's private copies of its pages — the relocated function table among them — and
the next call through that table jumps to the address the file holds on disk.

Seven crashes and a day went into finding that, and every one of them was a build
running beside an open app. `scripts/rebuild-binding.sh` rebuilds the database binding only
when Electron cannot load it and refuses while Cairn is running; `scripts/build-keyring.sh`
builds beside `native/` and renames over it.

**Fail closed.** A vault that will not open raises. It's never quietly treated as empty, because an empty vault reads exactly like somebody who has entered nothing — and that mistake looks like data loss and is silent.

## Comments

A comment explains the code in front of it in a sentence or two. History goes in the commit message and the changelog, never in the source. A comment that says what a constraint is stays true after a refactor; one that says what the code used to do is stale the moment somebody changes it.

## Reporting a bug

Screenshots are safe to attach — Cairn shows no absolute path and no host anywhere in its interface. Please do not paste the contents of your vault.
