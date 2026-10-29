"use client"

import * as React from "react"
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
import type { RabbitMQParameter } from "@/lib/rabbitmq/types"
import { AdminEmpty, AdminError, AdminToolbar, prettyJson } from "./shared"

export function AdminParameters() {
  const tr = useAdminText()
  const [items, setItems] = React.useState<RabbitMQParameter[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await adminFetch<RabbitMQParameter[]>("/parameters"))
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
        title={tr("parameters.title")}
        description={tr("parameters.description")}
        onRefresh={() => void load()}
        busy={loading}
        refreshLabel={tr("common.refresh")}
      />
      <AdminError message={error} />
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("parameters.component")}</TableHead>
              <TableHead>{tr("common.vhost")}</TableHead>
              <TableHead>{tr("common.name")}</TableHead>
              <TableHead>{tr("parameters.value")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !items.length ? (
              <AdminEmpty colSpan={4} message={tr("common.loading")} />
            ) : !items.length ? (
              <AdminEmpty colSpan={4} message={tr("parameters.empty")} />
            ) : (
              items.map((item) => (
                <TableRow key={`${item.component}/${item.vhost}/${item.name}`}>
                  <TableCell className="font-mono text-xs">{item.component}</TableCell>
                  <TableCell className="font-mono text-xs">{item.vhost || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{item.name}</TableCell>
                  <TableCell>
                    <code
                      className="block max-w-[520px] truncate font-mono text-[11px] text-muted-foreground"
                      title={prettyJson(item.value)}
                    >
                      {prettyJson(item.value)}
                    </code>
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
