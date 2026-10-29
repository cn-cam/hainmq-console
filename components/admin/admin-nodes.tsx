"use client"

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAdminText } from "@/lib/admin/client"
import { adminFetch } from "@/lib/admin/api"
import type { NodeStats } from "@/lib/rabbitmq/types"
import { formatBytes, formatUptime } from "@/lib/utils"
import { AdminEmpty, AdminError, AdminToolbar } from "./shared"

export function AdminNodes() {
  const tr = useAdminText()
  const [items, setItems] = React.useState<NodeStats[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await adminFetch<NodeStats[]>("/nodes"))
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

  return (
    <div className="space-y-3">
      <AdminToolbar
        title={tr("nodes.title")}
        description={tr("nodes.description")}
        onRefresh={() => void load()}
        busy={loading}
        refreshLabel={tr("common.refresh")}
      />
      <AdminError message={error} />
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("nodes.node")}</TableHead>
              <TableHead>{tr("nodes.uptime")}</TableHead>
              <TableHead>{tr("nodes.memory")}</TableHead>
              <TableHead>{tr("nodes.disk")}</TableHead>
              <TableHead>{tr("nodes.alarms")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !items.length ? (
              <AdminEmpty colSpan={5} message={tr("common.loading")} />
            ) : !items.length ? (
              <AdminEmpty colSpan={5} message={tr("nodes.empty")} />
            ) : (
              items.map((item) => {
                const alarms = [
                  item.mem_alarm ? "memory" : null,
                  item.disk_free_alarm ? "disk" : null,
                ].filter(Boolean)
                return (
                  <TableRow key={item.name}>
                    <TableCell className="font-mono text-xs">{item.name}</TableCell>
                    <TableCell className="text-xs">{formatUptime(item.uptime)}</TableCell>
                    <TableCell className="text-xs">
                      {formatBytes(item.mem_used)}
                      {item.mem_limit ? ` / ${formatBytes(item.mem_limit)}` : ""}
                    </TableCell>
                    <TableCell className="text-xs">
                      {formatBytes(item.disk_free)}
                      {item.disk_free_limit ? ` / ${formatBytes(item.disk_free_limit)}` : ""}
                    </TableCell>
                    <TableCell>
                      {alarms.length ? (
                        <div className="flex flex-wrap gap-1">
                          {alarms.map((alarm) => (
                            <Badge key={alarm} variant="destructive">
                              {alarm}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
