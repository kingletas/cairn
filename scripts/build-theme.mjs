#!/usr/bin/env node
// Generates src/renderer/styles/tokens.css from defaults/theme/cairn.json.
// Run by `npm run theme`, and by `make check` so a drifted file fails the build.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const t = JSON.parse(readFileSync(join(root, 'defaults', 'theme', 'cairn.json'), 'utf8'));

const vars = (obj, indent = '  ') =>
  Object.entries(obj).map(([k, v]) => `${indent}--${k}: ${v};`).join('\n');

const accentVars = (theme, name, indent = '  ') => {
  const a = t.accent[theme][name];
  return [
    `${indent}--accent: ${a.accent};`,
    `${indent}--accent-strong: ${a.strong};`,
    `${indent}--accent-soft: ${a.soft};`,
    `${indent}--accent-soft-line: ${a['soft-line']};`,
    `${indent}--accent-on-soft: ${a['on-soft']};`,
    `${indent}--accent-text: ${a.text};`,
    `${indent}--accent-ink: ${a.ink};`,
  ].join('\n');
};

// Two names per stage: the palette entry, and the one a component reads. A stage can
// then borrow another's colour by pointing the second at the first, and the theme file
// stays the only place a colour is written down.
const stageVars = (theme, indent = '  ') =>
  Object.entries(t.stage[theme])
    .map(([k, v]) => `${indent}--stage-token-${k}: ${v};\n${indent}--stage-${k}: var(--stage-token-${k});`)
    .join('\n');

// The two kinds of source. They are read side by side, so the eye has to tell one
// progress bar from the other without reading the label under it.
const laneVars = (theme, indent = '  ') =>
  Object.entries(t.lane[theme]).filter(([k]) => k !== 'note')
    .map(([k, v]) => `${indent}--lane-${k}: ${v};`).join('\n');

const typeVars = () =>
  Object.entries(t.type.roles)
    .map(([role, r]) => `  --font-${role}: ${r.weight} calc(${r.size}px * var(--fs))/${r.line} var(--${r.family});`)
    .join('\n');

const sizeVars = () =>
  Object.entries(t.type.roles)
    .map(([role, r]) => `  --size-${role}: calc(${r.size}px * var(--fs));`)
    .join('\n');

const accentNames = Object.keys(t.accent.light);

const out = `/* Generated from defaults/theme/cairn.json. Edit that and run \`make theme\`. */

:root {
${vars(t.light)}
${stageVars('light')}
${laneVars('light')}

  /* families */
  --serif: ${t.type.families.serif};
  --sans: ${t.type.families.sans};
  --mono: ${t.type.families.mono};

  /* type. --fs is the text-size setting; a bare px size is a defect */
  --fs: ${t.type.scale.default};
${sizeVars()}
${typeVars()}

  /* space */
${Object.entries(t.space).map(([k, v]) => `  --space-${k}: ${v}px;`).join('\n')}

  /* density. --d multiplies vertical padding on anything that makes a row */
  --d: ${t.density.comfortable};

  /* shape. There is no fourth radius */
  --r: ${t.radius.base}px;
  --r-pill: ${t.radius.pill}px;
  --r-round: ${t.radius.round};

  /* layout */
  --rail-width: ${t.layout.railWidth}px;
  --status-height: ${t.layout.statusBarHeight}px;
  --max-list: ${t.layout.maxWidth.list}px;
  --max-panels: ${t.layout.maxWidth.panels}px;
  --max-wide: ${t.layout.maxWidth.wide}px;

  /* motion */
  --motion-panel: ${t.motion.panel};
  --motion-row: ${t.motion.row};
  --motion-rail: ${t.motion.rail};
}

:root[data-size="small"] { --fs: ${t.type.scale.small}; }
:root[data-size="large"] { --fs: ${t.type.scale.large}; }
:root[data-density="compact"] { --d: ${t.density.compact}; }

/* Accent themes. Seven values, and every one switches together --
   three is not enough: hover, text on a fill and the border on it are all accent-derived. */
${accentNames.map((n) => `:root[data-accent="${n}"] {\n${accentVars('light', n)}\n}`).join('\n')}

/* Dark. prefers-color-scheme decides only when the user has not chosen,
   so an explicit light choice always wins. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${vars(t.dark, '    ')}
${stageVars('dark', '    ')}
${laneVars('dark', '    ')}
  }
${accentNames.map((n) => `  :root:not([data-theme="light"])[data-accent="${n}"] {\n${accentVars('dark', n, '    ')}\n  }`).join('\n')}
}

:root[data-theme="dark"] {
${vars(t.dark)}
${stageVars('dark')}
${laneVars('dark')}
}
${accentNames.map((n) => `:root[data-theme="dark"][data-accent="${n}"] {\n${accentVars('dark', n)}\n}`).join('\n')}

/* A swatch shows the colour it selects, so it is the one place a theme's own value
   is drawn rather than read. Generated here so component CSS stays free of literals. */
${accentNames.map((n) => `.swatches button[data-accent="${n}"] { background: ${t.accent.light[n].accent}; }`).join('\n')}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition: none !important; animation: none !important; }
}
`;

const target = join(root, 'src/renderer/styles/tokens.css');
const previous = (() => { try { return readFileSync(target, 'utf8'); } catch { return null; } })();

if (process.argv.includes('--check')) {
  if (previous !== out) {
    console.error('tokens.css is out of step with tokens.json. Run `npm run tokens`.');
    process.exit(1);
  }
  console.log('tokens.css matches tokens.json');
} else {
  writeFileSync(target, out);
  console.log(`wrote ${target.replace(root + '/', '')}`);
}
