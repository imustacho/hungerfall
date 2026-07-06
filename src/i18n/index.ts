import { Language, LocaleStrings } from './types.js';
import { enStrings } from './en.js';
import { trStrings } from './tr.js';
import { deStrings } from './de.js';

const locales: Record<Language, LocaleStrings> = {
  en: enStrings,
  tr: trStrings,
  de: deStrings,
};

/**
 * Returns the strings object for the specified language.
 * Falls back to English if the language is unsupported or undefined.
 */
export function getLocale(lang?: string | null): LocaleStrings {
  if (!lang) return locales.en;
  const l = lang.toLowerCase() as Language;
  return locales[l] || locales.en;
}
export * from './types.js';
