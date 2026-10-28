import { en, type MessageKey } from "./messages/en"
import { zhCN } from "./messages/zh-CN"
import type { Locale } from "./config"

export type { MessageKey }

export type TranslateVars = Record<string, string | number>

export type Translate = (key: MessageKey, vars?: TranslateVars) => string

export const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  en,
  "zh-CN": zhCN,
}

export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key]
    return value === undefined ? match : String(value)
  })
}
