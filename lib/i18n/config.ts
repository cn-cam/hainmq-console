export const LOCALES = ["en", "zh-CN"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

export const LOCALE_COOKIE = "hainmq-locale"

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
}

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "zh-CN"
}
