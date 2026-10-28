"use client"

import { Check, Languages } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { LOCALE_LABELS, LOCALES, type Locale } from "@/lib/i18n/config"
import { useI18n } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

export function LocaleSwitcher({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  const { locale, setLocale, t } = useI18n()
  const router = useRouter()

  const change = (next: Locale) => {
    if (next === locale) return
    setLocale(next)
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          className={cn(compact ? "h-8 w-8" : "h-8 gap-1.5 px-2.5 text-xs text-muted-foreground", className)}
          aria-label={t("locale.language")}
        >
          <Languages className="h-4 w-4" />
          {!compact && <span>{LOCALE_LABELS[locale]}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("locale.language")}</DropdownMenuLabel>
        {LOCALES.map((value) => (
          <DropdownMenuItem key={value} onClick={() => change(value)}>
            {LOCALE_LABELS[value]}
            {locale === value && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
