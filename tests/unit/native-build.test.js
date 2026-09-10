import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The build used to rewrite the database binding in place on every run, and a
 *  running Cairn has that file mapped -- so every `make check` beside an open app took
 *  it down at its next query. The script rebuilds only when Electron cannot load the
 *  binding, and never while the app is running. */
function fakeElectron(exitCode) {
  const dir = mkdtempSync(join(tmpdir(), 'cairn-fake-electron-'));
  const path = join(dir, 'electron');
  writeFileSync(path, `#!/usr/bin/env bash\nexit ${exitCode}\n`);
  chmodSync(path, 0o755);
  return { path, dir };
}

function run(args, electron) {
  const result = spawnSync('bash', ['scripts/rebuild-binding.sh', ...args], {
    env: { ...process.env, CAIRN_ELECTRON: electron }, encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

test('a binding Electron can load is left alone', () => {
  const { path, dir } = fakeElectron(0);
  try {
    const { status, out } = run(['-n'], path);
    assert.equal(status, 0);
    assert.match(out, /up to date/);
    assert.doesNotMatch(out, /rebuild/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a binding Electron cannot load is rebuilt', () => {
  const { path, dir } = fakeElectron(1);
  try {
    const { status, out } = run(['-n'], path);
    assert.equal(status, 0);
    assert.match(out, /would rebuild/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// `exec -a` sets argv[0], which is how this fakes a running app, and pgrep is what
// finds it. Neither exists on Windows, where the hazard does not either.
const posixOnly = process.platform === 'win32'
  ? { skip: 'no pgrep and no exec -a here; Windows refuses to overwrite a mapped module instead' }
  : {};

test('nothing is rebuilt while Cairn is running', posixOnly, async () => {
  // A process whose command line is what the launcher starts: the binary in this
  // checkout followed by a dot. Argument zero is enough for the pattern to match.
  const running = spawn('bash', ['-c', 'exec -a "$0 ." sleep 30', join(process.cwd(), 'node_modules/electron/dist/electron')]);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const { path, dir } = fakeElectron(1);
  try {
    const { status, out } = run(['-n'], path);
    assert.equal(status, 1, 'the rebuild went ahead under a running app');
    assert.match(out, /Cairn is running/);
  } finally {
    running.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('both build scripts are valid shell', () => {
  for (const script of ['scripts/rebuild-binding.sh', 'scripts/build-keyring.sh']) {
    assert.doesNotThrow(() => execFileSync('bash', ['-n', script]));
  }
});

test('the build never forces a rebuild on its own', () => {
  // `electron-rebuild -f` on every build is the thing this test exists to keep out.
  const { scripts } = JSON.parse(execFileSync('cat', ['package.json'], { encoding: 'utf8' }));
  assert.doesNotMatch(scripts.build, /electron-rebuild|npm run rebuild/);
  assert.match(scripts.build, /rebuild-binding\.sh/);
  assert.match(scripts.native, /build-keyring\.sh/);
});
