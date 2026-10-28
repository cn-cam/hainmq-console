"use client"

import { useT } from "@/lib/i18n/client"
import type { MessageKey } from "@/lib/i18n/dictionaries"

export function PageHeader({
  titleKey,
  descriptionKey,
}: {
  titleKey: MessageKey
  descriptionKey: MessageKey
}) {
  const t = useT()

  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">{t(titleKey)}</h2>
      <p className="text-sm text-muted-foreground">{t(descriptionKey)}</p>
    </div>
  )
}
