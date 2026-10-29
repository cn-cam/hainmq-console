"use client"

import * as React from "react"
import { PageHeader } from "@/components/shared/page-header"
import { useAdminText } from "@/lib/admin/client"
import type { AdminTextKey } from "@/lib/admin/text"
import { cn } from "@/lib/utils"
import { AdminVhosts } from "./admin-vhosts"
import { AdminUsers } from "./admin-users"
import { AdminPermissions } from "./admin-permissions"
import { AdminPolicies } from "./admin-policies"
import { AdminParameters } from "./admin-parameters"
import { AdminNodes } from "./admin-nodes"
import { AdminFeatureFlags } from "./admin-feature-flags"
import { AdminDefinitions } from "./admin-definitions"

const TABS = [
  { key: "vhosts", labelKey: "tabs.vhosts" },
  { key: "users", labelKey: "tabs.users" },
  { key: "permissions", labelKey: "tabs.permissions" },
  { key: "policies", labelKey: "tabs.policies" },
  { key: "parameters", labelKey: "tabs.parameters" },
  { key: "nodes", labelKey: "tabs.nodes" },
  { key: "featureFlags", labelKey: "tabs.featureFlags" },
  { key: "definitions", labelKey: "tabs.definitions" },
] as const satisfies ReadonlyArray<{ key: string; labelKey: AdminTextKey }>

type TabKey = (typeof TABS)[number]["key"]

export function AdminPage() {
  const tr = useAdminText()
  const [tab, setTab] = React.useState<TabKey>("vhosts")

  return (
    <div className="space-y-4">
      <PageHeader titleKey="page.admin.title" descriptionKey="page.admin.description" />

      <div className="flex gap-1 overflow-x-auto border-b pb-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={cn(
              "whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === item.key
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {tr(item.labelKey)}
          </button>
        ))}
      </div>

      {tab === "vhosts" && <AdminVhosts />}
      {tab === "users" && <AdminUsers />}
      {tab === "permissions" && <AdminPermissions />}
      {tab === "policies" && <AdminPolicies />}
      {tab === "parameters" && <AdminParameters />}
      {tab === "nodes" && <AdminNodes />}
      {tab === "featureFlags" && <AdminFeatureFlags />}
      {tab === "definitions" && <AdminDefinitions />}
    </div>
  )
}
