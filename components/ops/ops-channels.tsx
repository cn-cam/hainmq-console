"use client"

import * as React from "react"
import { Pencil, Plus, RefreshCw, Send, Trash2 } from "lucide-react"
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
import type { OpsChannel } from "@/lib/ops/types"

type ChannelForm = {
  name: string
  type: "email" | "webhook"
  enabled: boolean
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  from: string
  fromName: string
  to: string
  cc: string
  replyTo: string
  url: string
  method: string
  headers: string
  bodyTemplate: string
  timeoutMs: number
  retries: number
  secret: string
  allowPrivate: boolean
}

const EMPTY: ChannelForm = {
  name: "",
  type: "email",
  enabled: true,
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: "",
  from: "",
  fromName: "",
  to: "",
  cc: "",
  replyTo: "",
  url: "",
  method: "POST",
  headers: "{}",
  bodyTemplate: "",
  timeoutMs: 10000,
  retries: 3,
  secret: "",
  allowPrivate: false,
}

export function OpsChannels() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [channels, setChannels] = React.useState<OpsChannel[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<OpsChannel | null>(null)
  const [form, setForm] = React.useState<ChannelForm>(EMPTY)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setChannels(await opsFetch<OpsChannel[]>("/channels"))
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

  const openEdit = (channel: OpsChannel) => {
    const config = channel.config as unknown as Record<string, unknown>
    setEditing(channel)
    setForm({
      ...EMPTY,
      name: channel.name,
      type: channel.type,
      enabled: channel.enabled,
      host: String(config.host || ""),
      port: Number(config.port || 587),
      secure: Boolean(config.secure),
      username: String(config.username || ""),
      password: "",
      from: String(config.from || ""),
      fromName: String(config.fromName || ""),
      to: Array.isArray(config.to) ? config.to.join(", ") : "",
      cc: Array.isArray(config.cc) ? config.cc.join(", ") : "",
      replyTo: String(config.replyTo || ""),
      url: String(config.url || ""),
      method: String(config.method || "POST"),
      headers: JSON.stringify(config.headers || {}, null, 2),
      bodyTemplate: String(config.bodyTemplate || ""),
      timeoutMs: Number(config.timeoutMs || 10000),
      retries: Number(config.retries || 3),
      secret: "",
      allowPrivate: Boolean(config.allowPrivate),
    })
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      let headers: Record<string, string> = {}
      if (form.type === "webhook") {
        try {
          headers = JSON.parse(form.headers || "{}") as Record<string, string>
        } catch {
          throw new Error("Headers must be valid JSON")
        }
      }
      const config =
        form.type === "email"
          ? {
              host: form.host,
              port: Number(form.port),
              secure: form.secure,
              username: form.username,
              password: form.password,
              from: form.from,
              fromName: form.fromName || undefined,
              to: form.to.split(",").map((value) => value.trim()).filter(Boolean),
              cc: form.cc.split(",").map((value) => value.trim()).filter(Boolean),
              replyTo: form.replyTo || undefined,
            }
          : {
              url: form.url,
              method: form.method,
              headers,
              bodyTemplate: form.bodyTemplate || undefined,
              timeoutMs: Number(form.timeoutMs),
              retries: Number(form.retries),
              secret: form.secret || undefined,
              allowPrivate: form.allowPrivate,
            }

      const payload = {
        name: form.name,
        type: form.type,
        enabled: form.enabled,
        config,
      }
      if (editing) {
        await opsPut(`/channels/${editing.id}`, payload)
      } else {
        await opsPost("/channels", payload)
      }
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (channel: OpsChannel) => {
    if (!window.confirm(tr("common.confirmDelete"))) return
    try {
      await opsFetch(`/channels/${channel.id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.generic"))
    }
  }

  const test = async (channel: OpsChannel) => {
    setMessage(null)
    try {
      await opsPost(`/channels/${channel.id}/test`, {})
      setMessage(tr("channels.testSuccess"))
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
          <Plus className="h-3.5 w-3.5" /> {tr("channels.new")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("common.name")}</TableHead>
              <TableHead>{tr("channels.type")}</TableHead>
              <TableHead>{tr("common.status")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!channels.length ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-xs text-muted-foreground">
                  {tr("channels.empty")}
                </TableCell>
              </TableRow>
            ) : (
              channels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell className="text-xs font-medium">{channel.name}</TableCell>
                  <TableCell>
                    <Badge variant={channel.type === "email" ? "info" : "warning"}>
                      {channel.type === "email" ? tr("channels.email") : tr("channels.webhook")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={channel.enabled ? "success" : "secondary"}>
                      {channel.enabled ? tr("common.enabled") : tr("common.disabled")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => void test(channel)}
                      >
                        <Send className="h-3 w-3" /> {tr("common.test")}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(channel)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => void remove(channel)}
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
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? tr("channels.edit") : tr("channels.new")}</DialogTitle>
            <DialogDescription>{tr("rules.channelHelp")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("common.name")}</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("channels.type")}</Label>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm({ ...form, type: value as ChannelForm["type"] })
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">{tr("channels.email")}</SelectItem>
                  <SelectItem value="webhook">{tr("channels.webhook")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.type === "email" ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.host")}</Label>
                  <Input
                    value={form.host}
                    onChange={(event) => setForm({ ...form, host: event.target.value })}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.port")}</Label>
                  <Input
                    type="number"
                    value={form.port}
                    onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.username")}</Label>
                  <Input
                    value={form.username}
                    onChange={(event) => setForm({ ...form, username: event.target.value })}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.password")}</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    className="h-9 font-mono text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">{tr("channels.passwordHint")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.from")}</Label>
                  <Input
                    value={form.from}
                    onChange={(event) => setForm({ ...form, from: event.target.value })}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.fromName")}</Label>
                  <Input
                    value={form.fromName}
                    onChange={(event) => setForm({ ...form, fromName: event.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{tr("channels.to")}</Label>
                  <Input
                    value={form.to}
                    onChange={(event) => setForm({ ...form, to: event.target.value })}
                    className="h-9 font-mono text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">{tr("channels.toHint")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.cc")}</Label>
                  <Input
                    value={form.cc}
                    onChange={(event) => setForm({ ...form, cc: event.target.value })}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.replyTo")}</Label>
                  <Input
                    value={form.replyTo}
                    onChange={(event) => setForm({ ...form, replyTo: event.target.value })}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
                  <span className="text-sm">{tr("channels.secure")}</span>
                  <Switch
                    checked={form.secure}
                    onCheckedChange={(secure) => setForm({ ...form, secure })}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{tr("channels.url")}</Label>
                  <Input
                    value={form.url}
                    onChange={(event) => setForm({ ...form, url: event.target.value })}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.method")}</Label>
                  <Select
                    value={form.method}
                    onValueChange={(method) => setForm({ ...form, method })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["POST", "PUT", "PATCH"].map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.timeout")}</Label>
                  <Input
                    type="number"
                    value={form.timeoutMs}
                    onChange={(event) => setForm({ ...form, timeoutMs: Number(event.target.value) })}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.retries")}</Label>
                  <Input
                    type="number"
                    value={form.retries}
                    onChange={(event) => setForm({ ...form, retries: Number(event.target.value) })}
                    className="h-9 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{tr("channels.secret")}</Label>
                  <Input
                    type="password"
                    value={form.secret}
                    onChange={(event) => setForm({ ...form, secret: event.target.value })}
                    className="h-9 font-mono text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground">{tr("channels.secretHint")}</p>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{tr("channels.headers")}</Label>
                  <textarea
                    value={form.headers}
                    onChange={(event) => setForm({ ...form, headers: event.target.value })}
                    className="min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{tr("channels.bodyTemplate")}</Label>
                  <textarea
                    value={form.bodyTemplate}
                    onChange={(event) => setForm({ ...form, bodyTemplate: event.target.value })}
                    className="min-h-[100px] w-full rounded-md border bg-transparent px-3 py-2 font-mono text-xs"
                    placeholder='{"text":"{{title}} - {{message}}"}'
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
                  <span className="text-sm">{tr("channels.allowPrivate")}</span>
                  <Switch
                    checked={form.allowPrivate}
                    onCheckedChange={(allowPrivate) => setForm({ ...form, allowPrivate })}
                  />
                </div>
              </>
            )}

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
            <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>
              {saving ? tr("common.loading") : tr("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
