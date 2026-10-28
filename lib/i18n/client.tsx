"use client"

import * as React from "react"
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Locale,
} from "./config"
import type { Translate } from "./dictionaries"
import { translate } from "./translate"

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export function I18nProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale
  children: React.ReactNode
}) {
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale)

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next)
    document.documentElement.lang = next
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`
  }, [])

  const t = React.useCallback<Translate>(
    (key, vars) => translate(locale, key, vars),
    [locale],
  )

  const value = React.useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider")
  }
  return context
}

export function useT(): Translate {
  return useI18n().t
}
