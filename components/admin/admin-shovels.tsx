"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { AdminEmpty, AdminError } from "./shared"

interface Shovel {
  name: string
  vhost?: string
  state?: string
  type?: string
  source?: string
  destination?: string
}

export function AdminShovels() {
  const tr = useAdminText()
  const [items, setItems] = React.useState<Shovel[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await adminFetch<Shovel[]>("/shovels"))
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
      <div className="flex items-center gap-2">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{tr("shovels.title")}</h3>
          <p className="text-sm text-muted-foreground">{tr("shovels.description")}</p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> {tr("common.refresh")}
        </Button>
      </div>
      <AdminError message={error} />
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("common.name")}</TableHead>
              <TableHead>{tr("common.vhost")}</TableHead>
              <TableHead>{tr("common.state")}</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Destination</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!items.length ? (
              <AdminEmpty colSpan={5} message={loading ? tr("common.loading") : tr("shovels.empty")} />
            ) : (
              items.map((item) => (
                <TableRow key={`${item.vhost}/${item.name}`}>
                  <TableCell className="font-mono text-xs">{item.name}</TableCell>
                  <TableCell className="font-mono text-xs">{item.vhost || "—"}</TableCell>
                  <TableCell className="text-xs">{item.state || "—"}</TableCell>
                  <TableCell className="max-w-[260px] truncate font-mono text-xs">{item.source || "—"}</TableCell>
                  <TableCell className="max-w-[260px] truncate font-mono text-xs">{item.destination || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
