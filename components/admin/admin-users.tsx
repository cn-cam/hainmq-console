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
import type { RabbitMQUserAccount } from "@/lib/rabbitmq/types"
import { AdminEmpty, AdminError, AdminToolbar, formatTags, splitTags } from "./shared"

type Form = { name: string; password: string; tags: string }

const EMPTY: Form = { name: "", password: "", tags: "" }

export function AdminUsers() {
  const tr = useAdminText()
  const { toast } = useToast()
  const [items, setItems] = React.useState<RabbitMQUserAccount[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<RabbitMQUserAccount | null>(null)
  const [form, setForm] = React.useState<Form>(EMPTY)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await adminFetch<RabbitMQUserAccount[]>("/users"))
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

  const openEdit = (item: RabbitMQUserAccount) => {
    setEditing(item)
    setForm({ name: item.name, password: "", tags: formatTags(item.tags) })
    setOpen(true)
  }

  const save = async () => {
    const name = form.name.trim()
    if (!name || (!editing && !form.password)) {
      setError(tr("common.required"))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { tags: splitTags(form.tags) }
      if (form.password) body.password = form.password
      await adminPut(`/users/${encode(name)}`, body)
      toast({ title: editing ? tr("common.updated") : tr("common.created"), description: name })
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("common.requestFailed"))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: RabbitMQUserAccount) => {
    if (!window.confirm(`${tr("common.confirmDelete")}\n${item.name}\n${tr("users.deleteHint")}`)) {
      return
    }
    try {
      await adminDelete(`/users/${encode(item.name)}`)
      toast({ title: tr("common.deleted"), description: item.name })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("common.requestFailed"))
    }
  }

  return (
    <div className="space-y-3">
      <AdminToolbar
        title={tr("users.title")}
        description={tr("users.description")}
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
              <TableHead>{tr("users.username")}</TableHead>
              <TableHead>{tr("users.tags")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !items.length ? (
              <AdminEmpty colSpan={3} message={tr("common.loading")} />
            ) : !items.length ? (
              <AdminEmpty colSpan={3} message={tr("users.empty")} />
            ) : (
              items.map((item) => (
                <TableRow key={item.name}>
                  <TableCell className="font-mono text-xs">{item.name}</TableCell>
                  <TableCell className="text-xs">{formatTags(item.tags) || "—"}</TableCell>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? tr("common.edit") : tr("common.new")}</DialogTitle>
            <DialogDescription>{tr("users.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("users.username")}</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                disabled={Boolean(editing)}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("users.password")}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder={editing ? tr("users.passwordHint") : ""}
                className="h-9"
              />
              <p className="text-[11px] text-muted-foreground">{tr("users.passwordHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("users.tags")}</Label>
              <Input
                value={form.tags}
                onChange={(event) => setForm({ ...form, tags: event.target.value })}
                placeholder="administrator, monitoring"
                className="h-9"
              />
            </div>
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
