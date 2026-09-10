# Upgrading Cairn

Most upgrades need nothing from you. Pull, `make deps`, `make build`, and carry on.

This page is for the ones that do. Each section below is a change that your existing vault cannot survive on its own, what it asks of you, and how long it takes.

## How to tell whether this page applies to you

**Cairn tells you before you type anything.** If your vault was written in a format this build cannot read, the lock screen says so, gives you the steps, and doesn't ask for your passphrase. It never blames the passphrase for a change we made.

You can also look. Open **Vault & privacy → My vault**: it prints the format your vault was written in and the newest this build reads. If the first number is smaller than the second, the section below applies.

## Vault format 1 → 2

**What changed.** The library Cairn uses to encrypt the vault changed its file format. A vault written in format 1 cannot be opened by a build that writes format 2, with any passphrase.

**Why we couldn't avoid it.** We tried every combination. The old library does not compile against any Electron new enough to matter — the change in Electron's JavaScript engine that forced the library to be rewritten is the same rewrite that changed the format. Staying on the old library meant staying on an Electron with nineteen high-severity advisories against it, eight of them in Electron itself.

**Nothing is lost.** Your records are still in the file, and the version of Cairn that wrote them can still open them.

**What to do**, and it takes about five minutes:

1. Install the Cairn you were using before, and open it.
2. Go to **Vault & privacy → My data → Write everything out**. Keep that file.
3. Come back to the new Cairn and press **Set this vault aside**. It moves the old vault to a dated folder next to it and deletes nothing.
4. Choose a passphrase, finish setup, then **Read an export back in**.
5. **Delete the file you wrote out.** It's plain text and your passphrase doesn't protect it.

**If you would rather start fresh**, press **Set this vault aside** and set up as if new. The old vault stays on disk under its dated name, so you can change your mind.

## Node 20 → 22.12

**What changed.** Electron's own build tooling now requires Node 22.12 or newer, and Node 20 has passed the end of its supported life.

**What to do.** Upgrade Node before `make deps`. `node -v` tells you what you have.

## After any upgrade that replaces Electron

**Chromium's sandbox helper has to be owned by root, and `npm` installs it as you.** Cairn refuses to start without it rather than running unsandboxed, and prints the one command to run. `cairn --check-sandbox` says whether it is currently set up, and `make sandbox` prints the command.

This is not a Cairn decision so much as how Chromium works on Linux. It comes back every time a new Electron is downloaded.
