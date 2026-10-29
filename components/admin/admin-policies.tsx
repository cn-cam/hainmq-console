"use client"

import * as React from "react"
import { Loader2, Pencil, Trash2 } from "lucide-react"
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
import { adminDelete, adminFetch, adminPut, encode } from "@/lib/admin/api"
import type { RabbitMQPolicy } from "@/lib/rabbitmq/types"
import { AdminEmpty, AdminError, AdminToolbar, JsonTextarea, prettyJson } from "./shared"

type Form = {
  name: string
  vhost: string
  pattern: string
  applyTo: "all" | "queues" | "exchanges"
  priority: string
  definition: string
}

const EMPTY: Form = {
  name: "",
  vhost: "/",
  pattern: ".*",
  applyTo: "all",
  priority: "0",
  definition: "{\n  \"max-length\": 10000\n}",
}

export function AdminPolicies() {
  const tr = useAdminText()
  const { toast } = useToast()
  const [items, setItems] = React.useState<RabbitMQPolicy[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<RabbitMQPolicy | null>(null)
  const [form, setForm] = React.useState<Form>(EMPTY)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await adminFetch<RabbitMQPolicy[]>("/policies"))
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

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY)
    setOpen(true)
  }

  const openEdit = (item: RabbitMQPolicy) => {
    setEditing(item)
    setForm({
      name: item.name,
      vhost: item.vhost,
      pattern: item.pattern,
      applyTo: (item.apply_to || "all") as Form["applyTo"],
      priority: String(item.priority ?? 0),
      definition: prettyJson(item.definition),
    })
    setOpen(true)
  }

  const save = async () => {
    const name = form.name.trim()
    if (!name || !form.vhost.trim()) {
      setError(tr("common.required"))
      return
    }
    let definition: unknown
    try {
      definition = JSON.parse(form.definition)
    } catch {
      setError(tr("common.invalidJson"))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await adminPut(`/policies/${encode(form.vhost)}/${encode(name)}`, {
        pattern: form.pattern,
        definition,
        priority: Number(form.priority) || 0,
        "apply-to": form.applyTo,
      })
      toast({ title: editing ? tr("common.updated") : tr("common.created"), description: name })
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("common.requestFailed"))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: RabbitMQPolicy) => {
    if (!window.confirm(`${tr("common.confirmDelete")}\n${item.vhost}/${item.name}`)) {
      return
    }
    try {
      await adminDelete(`/policies/${encode(item.vhost)}/${encode(item.name)}`)
      toast({ title: tr("common.deleted"), description: item.name })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("common.requestFailed"))
    }
  }

  return (
    <div className="space-y-3">
      <AdminToolbar
        title={tr("policies.title")}
        description={tr("policies.description")}
        onRefresh={() => void load()}
        onNew={openCreate}
        busy={loading}
        refreshLabel={tr("common.refresh")}
        newLabel={tr("common.new")}
      />
      <AdminError message={error} />
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("policies.name")}</TableHead>
              <TableHead>{tr("common.vhost")}</TableHead>
              <TableHead>{tr("policies.pattern")}</TableHead>
              <TableHead>{tr("policies.applyTo")}</TableHead>
              <TableHead>{tr("policies.priority")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !items.length ? (
              <AdminEmpty colSpan={6} message={tr("common.loading")} />
            ) : !items.length ? (
              <AdminEmpty colSpan={6} message={tr("policies.empty")} />
            ) : (
              items.map((item) => (
                <TableRow key={`${item.vhost}/${item.name}`}>
                  <TableCell className="font-mono text-xs">{item.name}</TableCell>
                  <TableCell className="font-mono text-xs">{item.vhost}</TableCell>
                  <TableCell className="font-mono text-xs">{item.pattern}</TableCell>
                  <TableCell className="text-xs">{item.apply_to}</TableCell>
                  <TableCell className="text-xs">{item.priority}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => void remove(item)}
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
            <DialogTitle>{editing ? tr("common.edit") : tr("common.new")}</DialogTitle>
            <DialogDescription>{tr("policies.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("policies.name")}</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  disabled={Boolean(editing)}
                  className="h-9 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("common.vhost")}</Label>
                <Input
                  value={form.vhost}
                  onChange={(event) => setForm({ ...form, vhost: event.target.value })}
                  disabled={Boolean(editing)}
                  className="h-9 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("policies.pattern")}</Label>
                <Input
                  value={form.pattern}
                  onChange={(event) => setForm({ ...form, pattern: event.target.value })}
                  className="h-9 font-mono text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("policies.applyTo")}</Label>
                <Select
                  value={form.applyTo}
                  onValueChange={(value) => setForm({ ...form, applyTo: value as Form["applyTo"] })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr("policies.all")}</SelectItem>
                    <SelectItem value="queues">{tr("policies.queues")}</SelectItem>
                    <SelectItem value="exchanges">{tr("policies.exchanges")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{tr("policies.priority")}</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  className="h-9 font-mono text-sm"
                />
              </div>
            </div>
            <JsonTextarea
              label={tr("policies.definition")}
              value={form.definition}
              onChange={(definition) => setForm({ ...form, definition })}
              rows={8}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              {tr("common.cancel")}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tr("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
