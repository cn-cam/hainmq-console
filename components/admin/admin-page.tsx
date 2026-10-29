"use client"

import * as React from "react"
import { Server } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/shared/page-header"
import { useToast } from "@/hooks/use-toast"
import { useAdminText } from "@/lib/admin/client"
import type { AdminTextKey } from "@/lib/admin/text"
import { useAuth } from "@/lib/auth/store"
import { usePreferences } from "@/lib/stores/preferences"
import { cn } from "@/lib/utils"
import type { ClusterSummary } from "@/lib/rabbitmq/types"
import { AdminVhosts } from "./admin-vhosts"
import { AdminUsers } from "./admin-users"
import { AdminPermissions } from "./admin-permissions"
import { AdminPolicies } from "./admin-policies"
import { AdminParameters } from "./admin-parameters"
import { AdminNodes } from "./admin-nodes"
import { AdminFeatureFlags } from "./admin-feature-flags"
import { AdminShovels } from "./admin-shovels"
import { AdminFederation } from "./admin-federation"
import { AdminDefinitions } from "./admin-definitions"

const TABS = [
  { key: "vhosts", labelKey: "tabs.vhosts" },
  { key: "users", labelKey: "tabs.users" },
  { key: "permissions", labelKey: "tabs.permissions" },
  { key: "policies", labelKey: "tabs.policies" },
  { key: "parameters", labelKey: "tabs.parameters" },
  { key: "nodes", labelKey: "tabs.nodes" },
  { key: "featureFlags", labelKey: "tabs.featureFlags" },
  { key: "shovels", labelKey: "tabs.shovels" },
  { key: "federation", labelKey: "tabs.federation" },
  { key: "definitions", labelKey: "tabs.definitions" },
] as const satisfies ReadonlyArray<{ key: string; labelKey: AdminTextKey }>

type TabKey = (typeof TABS)[number]["key"]

export function AdminPage({ version }: { version: string }) {
  const tr = useAdminText()
  const { toast } = useToast()
  const { cluster, setAuth } = useAuth()
  const setVhost = usePreferences((s) => s.setVhost)
  const [tab, setTab] = React.useState<TabKey>("vhosts")
  const [clusters, setClusters] = React.useState<ClusterSummary[]>([])
  const [switching, setSwitching] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    fetch("/api/clusters")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.clusters)) setClusters(data.clusters)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const currentCluster = cluster ?? clusters[0] ?? null

  const switchCluster = async (clusterId: string) => {
    if (!clusterId || clusterId === currentCluster?.id) return
    setSwitching(true)
    try {
      const res = await fetch("/api/auth/switch-cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({
          title: tr("cluster.switchFailed"),
          description: data.error,
          variant: "destructive",
        })
        return
      }
      setVhost(null)
      setAuth(data.user, data.cluster ?? null)
      window.location.reload()
    } catch {
      toast({ title: tr("cluster.switchFailed"), variant: "destructive" })
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader titleKey="page.admin.title" descriptionKey="page.admin.description" />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Server className="h-3.5 w-3.5" />
          {tr("cluster.label")}
        </div>
        <Select
          value={currentCluster?.id ?? ""}
          onValueChange={(value) => void switchCluster(value)}
          disabled={switching || clusters.length === 0}
        >
          <SelectTrigger className="h-8 w-[230px] text-xs">
            <SelectValue placeholder={tr("cluster.label")} />
          </SelectTrigger>
          <SelectContent>
            {clusters.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="secondary" title={tr("version.label")}>
          v{version}
        </Badge>
        {clusters.length <= 1 && (
          <span className="text-[11px] text-muted-foreground">{tr("cluster.singleHint")}</span>
        )}
      </div>

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
      {tab === "shovels" && <AdminShovels />}
      {tab === "federation" && <AdminFederation />}
      {tab === "definitions" && <AdminDefinitions />}
    </div>
  )
}
