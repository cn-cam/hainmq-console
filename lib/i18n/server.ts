import { cookies } from "next/headers"
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config"

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value
  if (isLocale(cookieLocale)) return cookieLocale

  return DEFAULT_LOCALE
}
