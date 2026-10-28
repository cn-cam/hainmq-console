"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/lib/i18n/client"
import { opsText, type OpsTextKey } from "@/lib/ops/ui-text"
import { cn } from "@/lib/utils"

const TABS: Array<{ href: string; key: OpsTextKey; adminOnly?: boolean }> = [
  { href: "/ops", key: "tabs.overview" },
  { href: "/ops/alerts", key: "tabs.alerts" },
  { href: "/ops/rules", key: "tabs.rules" },
  { href: "/ops/channels", key: "tabs.channels" },
  { href: "/ops/targets", key: "tabs.targets", adminOnly: true },
  { href: "/ops/approvals", key: "tabs.approvals" },
  { href: "/ops/chat", key: "tabs.chat" },
  { href: "/ops/models", key: "tabs.models", adminOnly: true },
  { href: "/ops/settings", key: "tabs.settings", adminOnly: true },
]

export function OpsNav({
  role,
  username,
  chatEnabled,
}: {
  role: string
  username: string
  chatEnabled: boolean
}) {
  const pathname = usePathname()
  const { locale } = useI18n()
  const tr = (key: OpsTextKey) => opsText(locale, key)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{tr("title")}</h2>
          <p className="text-sm text-muted-foreground">{tr("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{username}</span>
          <Badge variant={role === "admin" ? "default" : role === "operator" ? "info" : "secondary"}>
            {role}
          </Badge>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b pb-2">
        {TABS.filter(
          (tab) =>
            (!tab.adminOnly || role === "admin") &&
            (tab.href !== "/ops/chat" || chatEnabled),
        ).map((tab) => {
          const active =
            tab.href === "/ops" ? pathname === "/ops" : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {tr(tab.key)}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
