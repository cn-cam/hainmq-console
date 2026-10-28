import type { Locale } from "./config"
import { dictionaries, interpolate, type MessageKey, type TranslateVars } from "./dictionaries"

export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  return interpolate(dictionaries[locale][key], vars)
}
