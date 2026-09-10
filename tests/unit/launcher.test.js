import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The launcher is the only part of Cairn a person runs before Cairn exists, so its
 *  failures are the ones with nothing to catch them. Every branch here took a wrong
 *  turn before it took the right one:
 *
 *  - npm's wrapper catches a signal, prints a line about it and exits 1, so a crash
 *    arrived looking like an ordinary failure and the fallback never fired.
 *  - `set -e` then ended the script the moment the crash happened, taking the
 *    fallback with it.
 *  - `if ! cmd` did not help, because the `!` inverts the status and leaves $? as 0.
 */
function withFakes(run) {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-launcher-'));
  const make = (name, body) => {
    const path = join(dir, name);
    writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(path, 0o755);
    return path;
  };
  try {
    return run(make);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Both streams, on success as well as failure. The message that says a crash was
 *  recovered from goes to stderr, and a helper that only kept stdout reported the
 *  launcher as silent when it had said exactly the right thing. */
function launch(electron, args = []) {
  const options = {
    env: {
      ...process.env, CAIRN_ELECTRON: electron, CAIRN_HOME: process.cwd(),
      // Somewhere with no remembered crash, so these tests do not depend on whether
      // the machine running them has one.
      XDG_STATE_HOME: mkdtempSync(join(tmpdir(), 'cairn-clean-state-')),
      XDG_CONFIG_HOME: mkdtempSync(join(tmpdir(), 'cairn-clean-config-')),
    },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  };
  try {
    const result = spawnSync('bash', ['bin/cairn', ...args], options);
    return {
      status: result.status,
      out: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } catch (error) {
    return { status: 1, out: String(error) };
  }
}

/** The launcher refuses to start without a root-owned chrome-sandbox, and it is right
 *  to. That refusal comes before everything these tests are about, so on a machine
 *  that cannot have one they would all assert against the refusal message instead.
 *  Skipped with the reason printed rather than passing quietly. */
function sandboxState() {
  if (process.platform !== 'linux') return { ready: true, why: '' };
  const helper = 'node_modules/electron/dist/chrome-sandbox';
  if (!existsSync(helper)) {
    return { ready: false, why: `${helper} is not here, so the launcher stops before any of this` };
  }
  const s = statSync(helper);
  const setuid = (s.mode & 0o4000) !== 0 && s.uid === 0;
  return setuid
    ? { ready: true, why: '' }
    : { ready: false, why: `${helper} is not root-owned and setuid, so the launcher stops before any of this` };
}

const SANDBOX = sandboxState();
/** Options for a test that has to get past the launcher's sandbox refusal. */
const needsSandbox = SANDBOX.ready ? {} : { skip: SANDBOX.why };

test('the launcher refuses to start without a root-owned sandbox helper', () => {
  // The one test that wants the refusal, so the refusal is covered even where the
  // rest are skipped -- and skipping everything would leave it covered nowhere.
  const launcher = readFileSync('bin/cairn', 'utf8');
  assert.match(launcher, /if ! sandbox_ready; then\s+explain_sandbox/,
    'the launcher must stop rather than run unsandboxed');
  assert.match(launcher, /Cairn does not start unsandboxed/, 'and the file must say why');
});

test('a crash starts again without the graphics card', needsSandbox, () => {
  withFakes((make) => {
    const electron = make('crashy',
      'if [[ " $* " == *" --disable-gpu "* ]]; then echo RECOVERED; exit 0; fi\nkill -SEGV $$');
    const { status, out } = launch(electron);
    assert.match(out, /took the window down/);
    assert.match(out, /RECOVERED/);
    assert.equal(status, 0);
  });
});

test('an ordinary failure is not retried', needsSandbox, () => {
  // Retrying a real application error would hide it behind a second identical one.
  withFakes((make) => {
    const electron = make('failing', 'echo "a real error" >&2; exit 1');
    const { status, out } = launch(electron);
    assert.doesNotMatch(out, /took the window down/);
    assert.equal(status, 1);
  });
});

test('a normal start is left alone', needsSandbox, () => {
  withFakes((make) => {
    const electron = make('fine', 'echo STARTED; exit 0');
    const { status, out } = launch(electron);
    assert.match(out, /STARTED/);
    assert.doesNotMatch(out, /took the window down/);
    assert.equal(status, 0);
  });
});

test('--software skips the graphics card without trying it first', needsSandbox, () => {
  withFakes((make) => {
    const electron = make('checking',
      'if [[ " $* " == *" --disable-gpu "* ]]; then echo SOFTWARE; exit 0; fi\necho TRIED_GPU; exit 0');
    const { out } = launch(electron, ['--software']);
    assert.match(out, /SOFTWARE/);
    assert.doesNotMatch(out, /TRIED_GPU/);
  });
});

test('the launcher never goes through npm’s wrapper', () => {
  // The wrapper turns a signal into an exit of 1, which is what made a crash
  // indistinguishable from a failure.
  const source = readFileSync('bin/cairn', 'utf8');
  assert.doesNotMatch(source, /\bnpx\b/, 'the launcher must run the binary directly');
});

test('the launcher is valid shell', () => {
  assert.doesNotThrow(() => execFileSync('bash', ['-n', 'bin/cairn']));
});

test('a machine that has crashed once does not have to crash again', needsSandbox, () => {
  // Recovering from a segfault on every launch is a worse experience than simply not
  // using the graphics card, and for a page of text the difference is not worth one
  // crash — let alone one a day.
  withFakes((make) => {
    const electron = make('crashy',
      'if [[ " $* " == *" --disable-gpu "* ]]; then echo RECOVERED; exit 0; fi\nkill -SEGV $$');
    const state = mkdtempSync(join(tmpdir(), 'cairn-state-'));
    try {
      const env = { ...process.env, CAIRN_ELECTRON: electron, CAIRN_HOME: process.cwd(),
        XDG_STATE_HOME: state, XDG_CONFIG_HOME: state };
      const once = spawnSync('bash', ['bin/cairn'], { env, encoding: 'utf8' });
      assert.match(`${once.stdout}${once.stderr}`, /Starting again without the/);
      assert.ok(existsSync(join(state, 'cairn', 'graphics-crashed')), 'the crash was not remembered');

      // Second launch: straight to software, no crash at all.
      const twice = spawnSync('bash', ['bin/cairn'], { env, encoding: 'utf8' });
      const out = `${twice.stdout}${twice.stderr}`;
      assert.match(out, /RECOVERED/);
      assert.doesNotMatch(out, /took the window down/, 'it crashed a second time');
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  });
});

test('software rendering never asks for Wayland at the same time', needsSandbox, () => {
  // Wayland composites on the GPU, so asking for Wayland and no GPU leaves Electron
  // nothing to draw on: it exits without a window and without a word.
  withFakes((make) => {
    const electron = make('echoer', 'printf "ARGS:"; for a in "$@"; do printf " %s" "$a"; done; echo; exit 0');
    const state = mkdtempSync(join(tmpdir(), 'cairn-state-'));
    try {
      const env = { ...process.env, CAIRN_ELECTRON: electron, CAIRN_HOME: process.cwd(),
        XDG_STATE_HOME: state, XDG_CONFIG_HOME: state };
      const { stdout } = spawnSync('bash', ['bin/cairn', '--software'], { env, encoding: 'utf8' });
      assert.match(stdout, /--disable-gpu/);
      assert.doesNotMatch(stdout, /wayland/i, 'software mode asked for Wayland');
      assert.match(stdout, /--ozone-platform=x11/, 'software mode must pin X11');
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  });
});

test('--try-graphics forgets a remembered crash', needsSandbox, () => {
  withFakes((make) => {
    const electron = make('crashy',
      'if [[ " $* " == *" --disable-gpu "* ]]; then echo RECOVERED; exit 0; fi\nkill -SEGV $$');
    const state = mkdtempSync(join(tmpdir(), 'cairn-state-'));
    try {
      const env = { ...process.env, CAIRN_ELECTRON: electron, CAIRN_HOME: process.cwd(),
        XDG_STATE_HOME: state, XDG_CONFIG_HOME: state };
      spawnSync('bash', ['bin/cairn'], { env, encoding: 'utf8' });
      assert.ok(existsSync(join(state, 'cairn', 'graphics-crashed')));

      spawnSync('bash', ['bin/cairn', '--try-graphics'], { env, encoding: 'utf8' });
      assert.ok(!existsSync(join(state, 'cairn', 'graphics-crashed')), 'the memory was not cleared');
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  });
});

test('a crash is written down with its signal, on either path', needsSandbox, () => {
  // The app cannot record its own segfault, so five crashes without the graphics card
  // left nothing but 'started' lines. The launcher writes the signal, how long in and
  // which path into the same file the app writes, so --crashes tells one story.
  withFakes((make) => {
    const electron = make('crashy', 'kill -SEGV $$');
    const state = mkdtempSync(join(tmpdir(), 'cairn-state-'));
    try {
      const env = { ...process.env, CAIRN_ELECTRON: electron, CAIRN_HOME: process.cwd(),
        XDG_STATE_HOME: state, XDG_CONFIG_HOME: state };
      spawnSync('bash', ['bin/cairn'], { env, encoding: 'utf8' });
      const log = readFileSync(join(state, 'cairn', 'logs', 'crashes.log'), 'utf8');
      assert.match(log, /taken down by SIGSEGV after \d+s on the graphics path/);
      // The retry crashed too, and that one is on record as the software path.
      assert.match(log, /taken down by SIGSEGV after \d+s on the software path/);

      const again = spawnSync('bash', ['bin/cairn', '--software'], { env, encoding: 'utf8' });
      assert.ok(again.status > 128, 'a crash on the software path must keep its exit status');
      assert.match(`${again.stdout}${again.stderr}`, /took the window down after \d+s, without the graphics card/);
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  });
});

test('a crash is remembered whenever it happens, not only at startup', needsSandbox, () => {
  // A driver does not only fail at startup: a window can work for ten minutes and go
  // down mid-click. Ignoring that sent the next launch back to what had just failed.
  withFakes((make) => {
    const electron = make('slow-crash',
      'if [[ " $* " == *" --disable-gpu "* ]]; then echo RECOVERED; exit 0; fi\n' +
      'sleep 31\nkill -SEGV $$');
    const state = mkdtempSync(join(tmpdir(), 'cairn-state-'));
    try {
      const env = { ...process.env, CAIRN_ELECTRON: electron, CAIRN_HOME: process.cwd(),
        XDG_STATE_HOME: state, XDG_CONFIG_HOME: state };
      const first = spawnSync('bash', ['bin/cairn'], { env, encoding: 'utf8' });
      const out = `${first.stdout}${first.stderr}`;

      // Not restarted -- somebody half an hour into a session does not want it
      // reopened underneath them.
      assert.doesNotMatch(out, /RECOVERED/, 'a long session was restarted under the user');
      assert.match(out, /took the window down after/);
      assert.match(out, /records are unharmed/);

      // But remembered, so the next start does not repeat it.
      assert.ok(existsSync(join(state, 'cairn', 'graphics-crashed')),
        'a crash after the first half-minute was forgotten');
      const second = spawnSync('bash', ['bin/cairn'], { env, encoding: 'utf8' });
      assert.match(`${second.stdout}${second.stderr}`, /RECOVERED/);
    } finally {
      rmSync(state, { recursive: true, force: true });
    }
  });
});

/** The launcher script does all of this for a checkout. A packaged Cairn has no
 *  launcher, so for months the fallback existed only for people building from source. */
test('a packaged Cairn falls back on its own, without the launcher', async () => {
  const main = readFileSync('src/main/index.ts', 'utf8');
  assert.match(main, /graphicsCrashedBefore\(/, 'nothing reads whether this machine has crashed');
  assert.match(main, /disableHardwareAcceleration\(\)/, 'and nothing acts on it');
  assert.match(main, /answeredOnTheCommandLine\(process\.argv/, '--crashes and --try-graphics need an answer');

  const diagnostics = readFileSync('src/main/diagnostics.ts', 'utf8');
  assert.match(diagnostics, /rememberGraphicsCrashed\(/, 'a crash nobody records cannot be fallen back from');
  assert.match(diagnostics, /details\.reason !== 'clean-exit'/,
    'a graphics process told to stop is not a crash, and every quit would put the machine on the slow path');
});

test('the two accounts of a crash agree on where the marker lives', async () => {
  // The launcher and the app both decide whether to use the graphics card. Two files
  // would mean the launcher recovering and the app not, on the same machine.
  const launcher = readFileSync('bin/cairn', 'utf8');
  assert.match(launcher, /XDG_STATE_HOME.*cairn/s);
  assert.match(launcher, /graphics-crashed/);
  const graphics = readFileSync('src/main/graphics.ts', 'utf8');
  assert.match(graphics, /XDG_STATE_HOME/);
  assert.match(graphics, /'graphics-crashed'/);
});

test('--crashes says something when there is nothing to say', async () => {
  const { answeredOnTheCommandLine } = await import('../../dist/main/graphics.js');
  const written = [];
  const before = process.stdout.write;
  process.stdout.write = (chunk) => { written.push(String(chunk)); return true; };
  try {
    assert.equal(answeredOnTheCommandLine(['electron', '.', '--crashes'], '/nowhere/at/all.log', '/nowhere/marker'), true);
    assert.equal(answeredOnTheCommandLine(['electron', '.'], '/nowhere/at/all.log', '/nowhere/marker'), false);
  } finally {
    process.stdout.write = before;
  }
  assert.match(written.join(''), /no crashes/, 'an empty log printed nothing at all, which reads as a broken flag');
});

test('--try-graphics forgets the crash, and says so either way', async () => {
  const { answeredOnTheCommandLine, graphicsCrashedBefore } = await import('../../dist/main/graphics.js');
  const dir = mkdtempSync(join(tmpdir(), 'cairn-graphics-'));
  const marker = join(dir, 'graphics-crashed');
  const said = [];
  const before = process.stdout.write;
  process.stdout.write = (chunk) => { said.push(String(chunk)); return true; };
  try {
    writeFileSync(marker, 'crashed\n');
    assert.equal(graphicsCrashedBefore(marker), true);
    answeredOnTheCommandLine(['--try-graphics'], '/nowhere.log', marker);
    assert.equal(graphicsCrashedBefore(marker), false, 'the marker is still there, so nothing changed');
    answeredOnTheCommandLine(['--try-graphics'], '/nowhere.log', marker);
  } finally {
    process.stdout.write = before;
    rmSync(dir, { recursive: true, force: true });
  }
  assert.match(said[0], /will use the graphics card again/);
  assert.match(said[1], /already using/, 'saying nothing the second time reads as a flag that stopped working');
});

test('the setuid helper is asked for on Linux and nowhere else', () => {
  // macOS ships no chrome-sandbox and needs none, so demanding one refused to start on
  // every Mac — and `stat -c` is GNU, so the check could not have read the file anyway.
  const launcher = readFileSync('bin/cairn', 'utf8');
  const ready = /sandbox_ready\(\) \{[\s\S]*?\n\}/.exec(launcher);
  assert.ok(ready !== null);
  assert.match(ready[0], /uname -s.*Linux/,
    'the sandbox check has to know which platform actually uses a setuid helper');
  const guard = ready[0].indexOf('uname -s');
  const file = ready[0].indexOf('-f "$helper"');
  assert.ok(guard < file, 'the platform is decided before the helper is demanded');
});
