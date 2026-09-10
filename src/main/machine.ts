/** A name for this machine that is not the user's name. */

const ADJECTIVES = [
  'auburn', 'brisk', 'candid', 'dusk', 'even', 'fallow', 'gentle', 'hollow',
  'ivory', 'jaunty', 'keen', 'lucid', 'marble', 'north', 'opal', 'plain',
  'quiet', 'russet', 'slate', 'tidal', 'umber', 'verdant', 'winter', 'yonder',
];

const NOUNS = [
  'heron', 'basin', 'cairn', 'drift', 'ember', 'furrow', 'grove', 'harbour',
  'inlet', 'juniper', 'kestrel', 'lantern', 'meadow', 'nettle', 'orchard', 'pike',
  'quarry', 'ridge', 'sorrel', 'thicket', 'upland', 'vale', 'willow', 'yarrow',
];

export function generateMachineName(): string {
  const pick = <T>(list: readonly T[]): T => {
    const index = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
    return list[index % list.length] as T;
  };
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}
