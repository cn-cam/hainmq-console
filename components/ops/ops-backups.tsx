"use client"

import * as React from "react"
import { Download, Loader2, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { formatOpsTime, opsFetch, opsPost } from "@/lib/ops/ui"
import { formatBytes } from "@/lib/utils"

interface Backup {
  name: string
  size: number
  createdAt: number
}

export function OpsBackups() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [items, setItems] = React.useState<Backup[]>([])
  const [loading, setLoading] = React.useState(true)
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await opsFetch<Backup[]>("/backups"))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [tr])

  React.useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0)
    return () => clearTimeout(kickoff)
  }, [load])

  const create = async () => {
    setCreating(true)
    setMessage(null)
    try {
      await opsPost("/backups", {})
      setMessage(tr("backups.created"))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.saveFailed"))
    } finally {
      setCreating(false)
    }
  }

  const restore = async (backup: Backup) => {
    if (!window.confirm(`${tr("backups.restoreConfirm")}\n${backup.name}`)) return
    setMessage(null)
    try {
      await opsPost(`/backups/${encodeURIComponent(backup.name)}/restore`, {})
      setMessage(tr("backups.restartRequired"))
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.generic"))
    }
  }

  const remove = async (backup: Backup) => {
    if (!window.confirm(`${tr("backups.confirmDelete")}\n${backup.name}`)) return
    try {
      await opsFetch(`/backups/${encodeURIComponent(backup.name)}`, { method: "DELETE" })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.generic"))
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
          {message}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">{tr("backups.title")}</h3>
          <p className="text-sm text-muted-foreground">{tr("backups.description")}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5" /> {tr("common.refresh")}
          </Button>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => void create()} disabled={creating}>
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {tr("backups.create")}
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("backups.name")}</TableHead>
              <TableHead>{tr("backups.size")}</TableHead>
              <TableHead>{tr("backups.time")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!items.length ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-xs text-muted-foreground">
                  {loading ? tr("common.loading") : tr("backups.empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((backup) => (
                <TableRow key={backup.name}>
                  <TableCell className="font-mono text-xs">{backup.name}</TableCell>
                  <TableCell className="text-xs">{formatBytes(backup.size)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatOpsTime(backup.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]">
                        <a href={`/api/ops/backups/${encodeURIComponent(backup.name)}/download`}>
                          <Download className="h-3 w-3" /> {tr("backups.download")}
                        </a>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => void restore(backup)}
                      >
                        <RotateCcw className="h-3 w-3" /> {tr("backups.restore")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => void remove(backup)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        {tr("backups.restoreHint")}
      </p>
    </div>
  )
}
