/** Choosing a catalogue for a locale the machine reports. Kept apart from the module
 *  that reads them, because that one reaches electron and this has to be testable. */

/** The catalogue closest to a locale. A locked vault holds the setting somebody chose,
 *  so the first screen follows the machine instead of always being English. */
export function closestTo(locale: string, available: readonly string[]): string {
  const want = locale.replace('_', '-').toLowerCase();
  const exact = available.find((one) => one.toLowerCase() === want);
  if (exact !== undefined) return exact;
  // pt-BR falls back to pt rather than to English: a near language is far closer than
  // no language, and every catalogue here is written for the whole of its language.
  const base = want.split('-')[0];
  return available.find((one) => one.toLowerCase().split('-')[0] === base) ?? 'en';
}
