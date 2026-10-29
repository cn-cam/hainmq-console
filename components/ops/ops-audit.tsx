"use client"

import * as React from "react"
import { Download, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useI18n } from "@/lib/i18n/client"
import { opsText } from "@/lib/ops/ui-text"
import { formatOpsTime, opsFetch } from "@/lib/ops/ui"

interface AuditEntry {
  id: number
  ts: number
  actor: string
  action: string
  target: string | null
  details: unknown
  result: string | null
}

function toMillis(value: string): string {
  if (!value) return ""
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? String(parsed) : ""
}

export function OpsAudit() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [items, setItems] = React.useState<AuditEntry[]>([])
  const [actor, setActor] = React.useState("")
  const [action, setAction] = React.useState("")
  const [target, setTarget] = React.useState("")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const query = React.useCallback(() => {
    const params = new URLSearchParams({ limit: "500" })
    if (actor.trim()) params.set("actor", actor.trim())
    if (action.trim()) params.set("action", action.trim())
    if (target.trim()) params.set("target", target.trim())
    if (toMillis(from)) params.set("from", toMillis(from))
    if (toMillis(to)) params.set("to", toMillis(to))
    return params
  }, [actor, action, target, from, to])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await opsFetch<AuditEntry[]>(`/audit?${query().toString()}`))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [query, tr])

  React.useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0)
    return () => clearTimeout(kickoff)
  }, [load])

  const exportCsv = () => {
    const params = query()
    params.set("format", "csv")
    const anchor = document.createElement("a")
    anchor.href = `/api/ops/audit?${params.toString()}`
    anchor.click()
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <Input
          value={actor}
          onChange={(event) => setActor(event.target.value)}
          placeholder={tr("audit.actor")}
          className="h-8 w-[150px] text-xs"
        />
        <Input
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder={tr("audit.action")}
          className="h-8 w-[170px] text-xs"
        />
        <Input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder={tr("audit.target")}
          className="h-8 w-[170px] text-xs"
        />
        <Input
          type="datetime-local"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          title={tr("audit.from")}
          className="h-8 w-[190px] text-xs"
        />
        <Input
          type="datetime-local"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          title={tr("audit.to")}
          className="h-8 w-[190px] text-xs"
        />
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> {tr("common.refresh")}
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> {tr("audit.export")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("common.time")}</TableHead>
              <TableHead>{tr("audit.actor")}</TableHead>
              <TableHead>{tr("audit.action")}</TableHead>
              <TableHead>{tr("audit.target")}</TableHead>
              <TableHead>{tr("audit.result")}</TableHead>
              <TableHead>{tr("audit.details")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!items.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-xs text-muted-foreground">
                  {loading ? tr("common.loading") : tr("audit.empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatOpsTime(entry.ts)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.actor}</TableCell>
                  <TableCell className="font-mono text-xs">{entry.action}</TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs">
                    {entry.target || "—"}
                  </TableCell>
                  <TableCell>
                    {entry.result ? (
                      <Badge variant={entry.result === "success" ? "success" : "destructive"}>
                        {entry.result}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code
                      className="block max-w-[420px] truncate font-mono text-[11px] text-muted-foreground"
                      title={entry.details ? JSON.stringify(entry.details) : ""}
                    >
                      {entry.details ? JSON.stringify(entry.details) : "—"}
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
