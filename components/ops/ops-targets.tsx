"use client"

import * as React from "react"
import { Pencil, Plus, RefreshCw, Trash2, Wifi } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
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
import { opsFetch, opsPost, opsPut } from "@/lib/ops/ui"
import type { OpsTarget } from "@/lib/ops/types"

type TargetForm = {
  name: string
  host: string
  port: string
  protocol: string
  vhost: string
  username: string
  password: string
  enabled: boolean
}

const EMPTY: TargetForm = {
  name: "",
  host: "host.docker.internal",
  port: "15672",
  protocol: "http",
  vhost: "",
  username: "",
  password: "",
  enabled: true,
}

export function OpsTargets() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [targets, setTargets] = React.useState<OpsTarget[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<OpsTarget | null>(null)
  const [form, setForm] = React.useState<TargetForm>(EMPTY)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setTargets(await opsFetch<OpsTarget[]>("/targets"))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.loadFailed"))
    }
  }, [tr])

  React.useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0)
    return () => clearTimeout(kickoff)
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY)
    setOpen(true)
  }

  const openEdit = (target: OpsTarget) => {
    setEditing(target)
    setForm({
      name: target.name,
      host: target.host,
      port: target.port,
      protocol: target.protocol,
      vhost: target.vhost || "",
      username: target.username,
      password: "",
      enabled: target.enabled,
    })
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        vhost: form.vhost || null,
      }
      if (editing) {
        await opsPut(`/targets/${editing.id}`, payload)
      } else {
        await opsPost("/targets", payload)
      }
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (target: OpsTarget) => {
    if (!window.confirm(tr("common.confirmDelete"))) return
    try {
      await opsFetch(`/targets/${target.id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.generic"))
    }
  }

  const test = async (target: OpsTarget) => {
    setMessage(null)
    try {
      const result = await opsPost<{ node?: string; managementVersion?: string }>(
        `/targets/${target.id}/test`,
        {},
      )
      setMessage(`${tr("targets.testSuccess")} · ${result.node || ""} ${result.managementVersion || ""}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.testFailed"))
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
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> {tr("common.refresh")}
        </Button>
        <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> {tr("targets.new")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("common.name")}</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>{tr("targets.username")}</TableHead>
              <TableHead>{tr("targets.vhost")}</TableHead>
              <TableHead>{tr("common.status")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!targets.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-xs text-muted-foreground">
                  {tr("targets.empty")}
                </TableCell>
              </TableRow>
            ) : (
              targets.map((target) => (
                <TableRow key={target.id}>
                  <TableCell className="text-xs font-medium">{target.name}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {target.protocol}://{target.host}:{target.port}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{target.username}</TableCell>
                  <TableCell className="font-mono text-xs">{target.vhost || tr("targets.allVhosts")}</TableCell>
                  <TableCell>
                    <Badge variant={target.enabled ? "success" : "secondary"}>
                      {target.enabled ? tr("common.enabled") : tr("common.disabled")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => void test(target)}
                      >
                        <Wifi className="h-3 w-3" /> {tr("common.test")}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(target)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => void remove(target)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? tr("targets.edit") : tr("targets.new")}</DialogTitle>
            <DialogDescription>{tr("targets.encryptionMissing")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">{tr("common.name")}</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder={tr("targets.namePlaceholder")}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("targets.host")}</Label>
              <Input
                value={form.host}
                onChange={(event) => setForm({ ...form, host: event.target.value })}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("targets.port")}</Label>
              <Input
                value={form.port}
                onChange={(event) => setForm({ ...form, port: event.target.value })}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("targets.protocol")}</Label>
              <Select
                value={form.protocol}
                onValueChange={(protocol) => setForm({ ...form, protocol })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="http">http</SelectItem>
                  <SelectItem value="https">https</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("targets.vhost")}</Label>
              <Input
                value={form.vhost}
                onChange={(event) => setForm({ ...form, vhost: event.target.value })}
                placeholder={tr("targets.allVhosts")}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("targets.username")}</Label>
              <Input
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("targets.password")}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                className="h-9 font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">{tr("targets.passwordHint")}</p>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
              <span className="text-sm">{tr("common.enabled")}</span>
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm({ ...form, enabled })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tr("common.cancel")}
            </Button>
            <Button
              onClick={() => void save()}
              disabled={saving || !form.name.trim() || !form.host.trim() || !form.username.trim()}
            >
              {saving ? tr("common.loading") : tr("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
