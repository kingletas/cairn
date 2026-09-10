# Installing Cairn

Cairn runs on Linux, macOS and Windows. **No release is published right now**, so build it from source as the [README](../README.md#getting-started) shows. When a release exists it carries a file for each system; take the one for your machine from the [releases page](https://github.com/kingletas/cairn/releases).

| You are on | Take |
|---|---|
| Linux, any distribution | the `.AppImage` |
| Debian, Ubuntu, Mint | the `.deb` |
| Fedora, RHEL, openSUSE | the `.rpm` |
| macOS, Apple silicon | the `arm64.dmg` |
| Windows | `Cairn-Setup-<version>.exe`, or the portable `.exe` to run without installing |

## None of it is signed, and here is what that looks like

A signing certificate is a paid account with Apple and another with Microsoft, and a private key held in CI. Cairn has neither, so the operating system will tell you it does not know who made this. **That is what an unsigned build looks like, not a sign of trouble** — and building from source avoids the question entirely.

**macOS** will say Cairn *"is damaged and can't be opened"* or *"cannot be opened because the developer cannot be verified"*. Both mean the same thing. Open it once with **right-click → Open** rather than a double-click, and confirm. If macOS still refuses, run this once and open it again:

```bash
xattr -dr com.apple.quarantine /Applications/Cairn.app
```

**Windows** shows *"Windows protected your PC"* from SmartScreen. Choose **More info**, then **Run anyway**.

**Linux** asks nothing. An AppImage needs to be made executable first:

```bash
chmod +x Cairn-*.AppImage
```

## Building it yourself

The other way, and the one with nothing to take on trust. You need **Node 22.12 or newer**, a **Rust toolchain** ([rustup.rs](https://rustup.rs) installs one) and a **C compiler** — `build-essential` on Ubuntu, `xcode-select --install` on macOS, the Visual Studio Build Tools on Windows.

```bash
git clone https://github.com/kingletas/cairn.git
```

```bash
cd cairn && make deps && make run
```

`make package` writes installers for the machine you are on into `release/`. **It builds only for that machine**: the Rust key module and the database binding are compiled against the host, and neither cross-builds — which is why every release is built three times, once on each runner.

## The one privileged step, on Linux only

Chromium isolates the part of Cairn that reads a web page, and its sandbox helper has to be owned by root. `npm` installs it as you, so Cairn stops and prints the command rather than running without a sandbox. `make sandbox` prints it too, and `cairn --check-sandbox` says whether it is set up.

**It comes back after any `npm install` that replaces Electron**, because that puts the file back the way npm makes it. The packaged AppImage, `.deb` and `.rpm` carry their own and need none of this.

## Where Cairn keeps things

| | |
|---|---|
| Linux | `~/.config/cairn` |
| macOS | `~/Library/Application Support/cairn` |
| Windows | `%APPDATA%\cairn` |

Your vault is the `vault` folder inside it, unless you moved it — **Vault & privacy → My vault** says where it is and can put it somewhere else, such as an encrypted disk or a folder that gets backed up. It is copied and counted before anything is removed, so a move that fails leaves the vault where it was. Nothing outside that folder is yours, and nothing inside it leaves the machine.
