import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

/** What a distributable has to contain, checked against what the app reads. */
const config = readFileSync('electron-builder.yml', 'utf8');

test('the archive carries everything the app reads at runtime', () => {
  // Reached by walking up from dist/main, so they sit beside it inside the archive
  // exactly as they do in a checkout. docs/ is there because two screens name a path in it.
  for (const needed of ['dist/**', 'defaults/**', 'native/**', 'docs/**', 'package.json']) {
    assert.ok(config.includes(needed), `electron-builder.yml should package ${needed}`);
  }
});

test('the native module is unpacked, because a .node cannot load from inside an asar', () => {
  assert.match(config, /asarUnpack:[\s\S]*native\/\*\*/);
});

test('packaging output does not land on the build output', () => {
  // Both defaulted to dist/, and the packager cleared the directory it was about to
  // read the app from.
  assert.match(config, /output: release/);
  assert.ok(!/output: dist/.test(config), 'release output must not be dist/');
});

test('the icon sizes the packager wants are committed', () => {
  // Generated from the SVG, and kept in the repository so a build needs no image
  // tooling. `make icons` regenerates them.
  for (const size of [16, 32, 48, 64, 128, 256, 512]) {
    assert.ok(existsSync(`build/icons/${size}x${size}.png`), `build/icons/${size}x${size}.png is missing`);
  }
});

test('a .deb names a maintainer and a homepage, or fpm refuses to build it', () => {
  assert.match(config, /maintainer:/);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.ok(typeof pkg.homepage === 'string' && pkg.homepage.length > 0);
  assert.equal(pkg.desktopName, 'com.kingletas.Cairn.desktop',
    'without this a running window is not tied to the desktop entry, and the dock shows a generic icon');
});

test('every operating system the docs promise has a target', () => {
  // A README naming a .dmg over a config that builds none is a promise nothing keeps.
  for (const platform of ['mac:', 'win:', 'linux:']) {
    assert.ok(config.includes(`\n${platform}`), `electron-builder.yml builds nothing for ${platform}`);
  }
  for (const target of ['AppImage', 'deb', 'rpm', 'tar.gz', 'dmg', 'zip', 'nsis', 'portable']) {
    assert.ok(config.includes(target), `no ${target} is built, and a release page says there is one`);
  }
});

test('a release is built once on each operating system', () => {
  // The key module and the database binding are compiled against the host and neither
  // cross-builds, so one runner producing every platform ships builds that cannot open a
  // vault. Intel Macs get none, and nothing may claim otherwise.
  const release = readFileSync('.github/workflows/release.yml', 'utf8');
  for (const runner of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    assert.ok(release.includes(runner), `nothing releases from ${runner}`);
  }
  assert.ok(!/macos-13/.test(release), 'an Intel Mac build is promised nowhere else, so it must not come back unnoticed');
  assert.ok(!/Intel/.test(readFileSync('docs/installing.md', 'utf8')),
    'the installing guide names a file the release does not contain');
  // Not on a push or a pull request: a macOS minute is billed at ten. The release is
  // what builds and tests all three, so a break on either fails the release rather than
  // reaching anybody, and the matrix stays runnable by hand before a tag.
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(ci, /workflow_dispatch/, 'nothing can run the cross-platform build by hand');
  assert.match(ci, /if: github\.event_name == 'workflow_dispatch'/,
    'the paid runners are back on every push and every dependabot pull request');
  for (const runner of ['macos-latest', 'windows-latest']) {
    assert.ok(ci.includes(runner), `${runner} cannot be checked at all before a tag`);
    assert.ok(release.includes(runner), `the release never builds on ${runner}`);
  }
});

test('the crash log has one home, and the app decides where', () => {
  // The app wrote to a Linux path on every platform, and the launcher kept its own
  // copy somewhere else again — two accounts of one crash.
  assert.match(readFileSync('src/main/diagnostics.ts', 'utf8'), /app\.getPath\('logs'\)/);
  const launcher = readFileSync('bin/cairn', 'utf8');
  assert.match(launcher, /log_dir=.*\/cairn\/logs/);
  assert.ok(!/state_dir\/crashes\.log/.test(launcher), 'the launcher still writes its own copy elsewhere');
});

test('nothing shipped carries the name of the machine that built it', () => {
  // rpmbuild stamps its host into the package. A runner's name is nobody's; a
  // workstation's goes to everybody who installs it.
  assert.match(config, /_buildhost/, 'the rpm would carry the build machine’s hostname');
});

test('scratch belonging to whoever is working here is ignored by the repository itself', () => {
  // The exclude file that ignores it on one machine travels with nothing, so a clone
  // would commit somebody's working directory.
  assert.match(readFileSync('.gitignore', 'utf8'), /^\/local\.d\/$/m);
});

test('every npm script runs on Windows too', () => {
  // npm hands a script to cmd on Windows, which cannot execute a .sh path and does not
  // understand VAR=value in front of a command. The Windows build had never once run.
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  const broken = [];
  for (const [name, body] of Object.entries(scripts)) {
    if (/(^|&&\s*)scripts\/\S+\.sh/.test(body)) broken.push(`${name}: runs a .sh path without bash`);
    if (/(^|&&\s*)[A-Z_]+=\S+\s/.test(body)) broken.push(`${name}: sets a variable the way only a shell understands`);
  }
  assert.deepEqual(broken, [], 'these fail on Windows, where npm runs a script through cmd');
});
