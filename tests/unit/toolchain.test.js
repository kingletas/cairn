import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/** Two development dependencies are held back on purpose, each behind something else. */
const installed = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const dependabot = readFileSync('.github/dependabot.yml', 'utf8');

test('the Node types describe the Node inside Electron', () => {
  // The suite runs on Electron, so this is the runtime the app ships with. Newer types
  // would accept calls that do not exist there.
  const runtime = process.versions.node.split('.')[0];
  const types = installed('@types/node').version.split('.')[0];
  assert.equal(types, runtime,
    `Electron runs Node ${runtime} and @types/node is ${types}: move @types/node to ^${runtime}`);
});

/** The highest TypeScript line a peer range such as ">=4.8.4 <6.1.0" admits, as "6.0". */
function ceilingLine(range) {
  const found = /<(\d+)\.(\d+)\.0\b/.exec(range);
  assert.ok(found, `cannot read a ceiling from ${range}`);
  const [major, minor] = [Number(found[1]), Number(found[2])];
  assert.ok(minor > 0, `the ceiling ${range} names no minor line to hold at`);
  return { line: `${major}.${minor - 1}`, next: `${major}.${minor}` };
}

test('TypeScript is held at the newest version the linter accepts, and no further back', () => {
  const { line, next } = ceilingLine(installed('typescript-eslint').peerDependencies.typescript);
  assert.match(pkg.devDependencies.typescript, new RegExp(`^~${line.replace('.', '\\.')}\\.\\d+$`),
    `typescript-eslint accepts TypeScript ${line}: set typescript to ~${line}.x in package.json`);
  assert.ok(dependabot.includes(`dependency-name: typescript\n        versions: ['>=${next}']`),
    `dependabot.yml should ignore typescript >=${next}, the first version typescript-eslint refuses`);
});

test('the napi crate and the napi command are the same major version', () => {
  // napi-rs releases the two as a matched pair, and Dependabot moves them in separate
  // pull requests, so a major version arriving in one of them has to wait for the other.
  const lock = readFileSync('crates/cairn-keyring/Cargo.lock', 'utf8');
  const crate = /\[\[package\]\]\nname = "napi"\nversion = "(\d+)\./.exec(lock);
  assert.ok(crate, 'no napi crate in Cargo.lock');
  const cli = installed('@napi-rs/cli').version.split('.')[0];
  assert.equal(crate[1], cli,
    `the napi crate is ${crate[1]}.x and @napi-rs/cli is ${cli}.x: move both in one change`);
});

test('the ceiling reader finds the line to hold at', () => {
  assert.deepEqual(ceilingLine('>=4.8.4 <6.1.0'), { line: '6.0', next: '6.1' });
  assert.deepEqual(ceilingLine('>=4.8.4 <7.3.0'), { line: '7.2', next: '7.3' });
  assert.throws(() => ceilingLine('>=4.8.4'));
});
