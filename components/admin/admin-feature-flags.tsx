"use client"

import * as React from "react"
import { Loader2, Play } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAdminText } from "@/lib/admin/client"
import { adminFetch, adminPut, encode } from "@/lib/admin/api"
import type { RabbitMQFeatureFlag } from "@/lib/rabbitmq/types"
import { AdminEmpty, AdminError, AdminToolbar } from "./shared"

export function AdminFeatureFlags() {
  const tr = useAdminText()
  const { toast } = useToast()
  const [items, setItems] = React.useState<RabbitMQFeatureFlag[]>([])
  const [loading, setLoading] = React.useState(true)
  const [enabling, setEnabling] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await adminFetch<RabbitMQFeatureFlag[]>("/feature-flags"))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("common.requestFailed"))
    } finally {
      setLoading(false)
    }
  }, [tr])

  React.useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0)
    return () => clearTimeout(kickoff)
  }, [load])

  const enable = async (item: RabbitMQFeatureFlag) => {
    if (!window.confirm(`${tr("featureFlags.enableConfirm")}\n${item.name}`)) return
    setEnabling(item.name)
    setError(null)
    try {
      await adminPut(`/feature-flags/${encode(item.name)}/enable`, {})
      toast({ title: tr("common.updated"), description: item.name })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("common.requestFailed"))
    } finally {
      setEnabling(null)
    }
  }

  return (
    <div className="space-y-3">
      <AdminToolbar
        title={tr("featureFlags.title")}
        description={tr("featureFlags.description")}
        onRefresh={() => void load()}
        busy={loading}
        refreshLabel={tr("common.refresh")}
      />
      <AdminError message={error} />
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("common.name")}</TableHead>
              <TableHead>{tr("featureFlags.state")}</TableHead>
              <TableHead>{tr("featureFlags.stability")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !items.length ? (
              <AdminEmpty colSpan={4} message={tr("common.loading")} />
            ) : !items.length ? (
              <AdminEmpty colSpan={4} message={tr("featureFlags.empty")} />
            ) : (
              items.map((item) => (
                <TableRow key={item.name}>
                  <TableCell className="font-mono text-xs">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant={item.state === "enabled" ? "success" : "secondary"}>
                      {item.state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{item.stability || "—"}</TableCell>
                  <TableCell>
                    {item.state !== "enabled" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-[11px]"
                        onClick={() => void enable(item)}
                        disabled={Boolean(enabling)}
                      >
                        {enabling === item.name ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        {tr("featureFlags.enable")}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
