#!/usr/bin/env node
// tsc emits JavaScript. Everything else the app loads at runtime is copied here.

import { cpSync, mkdirSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

mkdirSync(join(dist, 'renderer/styles'), { recursive: true });
cpSync(join(root, 'src/renderer/index.html'), join(dist, 'renderer/index.html'));
cpSync(join(root, 'src/renderer/styles'), join(dist, 'renderer/styles'), { recursive: true });

// The preload is an ES module and Electron only treats it as one when the file says
// so. Renaming it to .cjs does not convert it -- that leaves `import` in a file Node
// parses as CommonJS, and the whole window comes up blank with nothing in the log.
const preload = join(dist, 'preload/index.js');
if (existsSync(preload)) renameSync(preload, join(dist, 'preload/index.mjs'));

console.log('assets copied to dist/');
