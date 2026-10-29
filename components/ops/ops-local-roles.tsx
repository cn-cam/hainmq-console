"use client"

import * as React from "react"
import { Plus, RefreshCw, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { formatOpsTime, opsFetch, opsPut } from "@/lib/ops/ui"
import type { OpsRole } from "@/lib/ops/types"

interface LocalRole {
  username: string
  role: OpsRole
  updatedBy: string
  updatedAt: number
}

export function OpsLocalRoles() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [items, setItems] = React.useState<LocalRole[]>([])
  const [username, setUsername] = React.useState("")
  const [role, setRole] = React.useState<OpsRole>("operator")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setItems(await opsFetch<LocalRole[]>("/local-users"))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.loadFailed"))
    }
  }, [tr])

  React.useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0)
    return () => clearTimeout(kickoff)
  }, [load])

  const save = async () => {
    const name = username.trim()
    if (!name) {
      setError(tr("common.required"))
      return
    }
    setBusy(true)
    try {
      await opsPut(`/local-users/${encodeURIComponent(name)}`, { role })
      setUsername("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.saveFailed"))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (item: LocalRole) => {
    if (!window.confirm(`${tr("common.confirmDelete")}\n${item.username}`)) return
    try {
      await opsFetch(`/local-users/${encodeURIComponent(item.username)}`, {
        method: "DELETE",
      })
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
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{tr("localRoles.title")}</h3>
        <p className="text-sm text-muted-foreground">{tr("localRoles.description")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={tr("localRoles.username")}
            className="h-8 w-[180px] font-mono text-xs"
          />
        </div>
        <Select value={role} onValueChange={(value) => setRole(value as OpsRole)}>
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">viewer</SelectItem>
            <SelectItem value="operator">operator</SelectItem>
            <SelectItem value="admin">admin</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => void save()} disabled={busy}>
          <Plus className="h-3.5 w-3.5" /> {tr("localRoles.add")}
        </Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> {tr("common.refresh")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("localRoles.username")}</TableHead>
              <TableHead>{tr("localRoles.role")}</TableHead>
              <TableHead>Updated by</TableHead>
              <TableHead>{tr("common.time")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!items.length ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-xs text-muted-foreground">
                  {tr("localRoles.empty")}
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.username}>
                  <TableCell className="font-mono text-xs">{item.username}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.role === "admin"
                          ? "default"
                          : item.role === "operator"
                            ? "info"
                            : "secondary"
                      }
                    >
                      {item.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{item.updatedBy}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatOpsTime(item.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => void remove(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-[11px] text-muted-foreground">{tr("localRoles.hint")}</p>
    </div>
  )
}
