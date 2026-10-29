"use client"

import { useI18n } from "@/lib/i18n/client"
import { adminText, type AdminTextKey } from "./text"

export function useAdminText() {
  const { locale } = useI18n()
  return (key: AdminTextKey) => adminText(locale, key)
}
