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

interface FederationLink {
  node?: string
  vhost?: string
  exchange?: string
  upstream?: string
  type?: string
  status?: string
  local_connection?: string
  uri?: string
}

export function AdminFederation() {
  const tr = useAdminText()
  const [items, setItems] = React.useState<FederationLink[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await adminFetch<FederationLink[]>("/federation-links"))
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
          <h3 className="text-lg font-semibold tracking-tight">{tr("federation.title")}</h3>
          <p className="text-sm text-muted-foreground">{tr("federation.description")}</p>
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
              <TableHead>{tr("common.vhost")}</TableHead>
              <TableHead>Exchange</TableHead>
              <TableHead>Upstream</TableHead>
              <TableHead>{tr("common.state")}</TableHead>
              <TableHead>Node</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!items.length ? (
              <AdminEmpty colSpan={5} message={loading ? tr("common.loading") : tr("federation.empty")} />
            ) : (
              items.map((item, index) => (
                <TableRow key={`${item.vhost}-${item.exchange}-${item.upstream}-${index}`}>
                  <TableCell className="font-mono text-xs">{item.vhost || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{item.exchange || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{item.upstream || "—"}</TableCell>
                  <TableCell className="text-xs">{item.status || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{item.node || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
