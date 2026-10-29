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
import type { RabbitMQPermission, RabbitMQUserAccount, VHost } from "@/lib/rabbitmq/types"
import { AdminEmpty, AdminError, AdminToolbar } from "./shared"

type Form = {
  user: string
  vhost: string
  configure: string
  write: string
  read: string
}

const EMPTY: Form = { user: "", vhost: "/", configure: ".*", write: ".*", read: ".*" }

export function AdminPermissions() {
  const tr = useAdminText()
  const { toast } = useToast()
  const [items, setItems] = React.useState<RabbitMQPermission[]>([])
  const [users, setUsers] = React.useState<RabbitMQUserAccount[]>([])
  const [vhosts, setVhosts] = React.useState<VHost[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<RabbitMQPermission | null>(null)
  const [form, setForm] = React.useState<Form>(EMPTY)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [permissions, userList, vhostList] = await Promise.all([
        adminFetch<RabbitMQPermission[]>("/permissions"),
        adminFetch<RabbitMQUserAccount[]>("/users").catch(() => []),
        adminFetch<VHost[]>("/vhosts").catch(() => []),
      ])
      setItems(permissions)
      setUsers(userList)
      setVhosts(vhostList)
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
    setForm({
      ...EMPTY,
      user: users[0]?.name || "",
      vhost: vhosts[0]?.name || "/",
    })
    setOpen(true)
  }

  const openEdit = (item: RabbitMQPermission) => {
    setEditing(item)
    setForm({
      user: item.user,
      vhost: item.vhost,
      configure: item.configure,
      write: item.write,
      read: item.read,
    })
    setOpen(true)
  }

  const save = async () => {
    if (!form.user.trim() || !form.vhost.trim()) {
      setError(tr("common.required"))
      return
    }
    setSaving(true)
    setError(null)
    try {
      await adminPut(
        `/permissions/${encode(form.vhost)}/${encode(form.user)}`,
        { configure: form.configure, write: form.write, read: form.read },
      )
      toast({
        title: editing ? tr("common.updated") : tr("common.created"),
        description: `${form.user} @ ${form.vhost}`,
      })
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("common.requestFailed"))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (item: RabbitMQPermission) => {
    if (!window.confirm(`${tr("common.confirmDelete")}\n${item.user} @ ${item.vhost}\n${tr("permissions.deleteHint")}`)) {
      return
    }
    try {
      await adminDelete(`/permissions/${encode(item.vhost)}/${encode(item.user)}`)
      toast({ title: tr("common.deleted"), description: `${item.user} @ ${item.vhost}` })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("common.requestFailed"))
    }
  }

  return (
    <div className="space-y-3">
      <AdminToolbar
        title={tr("permissions.title")}
        description={tr("permissions.description")}
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
              <TableHead>{tr("permissions.user")}</TableHead>
              <TableHead>{tr("permissions.vhost")}</TableHead>
              <TableHead>{tr("permissions.configure")}</TableHead>
              <TableHead>{tr("permissions.write")}</TableHead>
              <TableHead>{tr("permissions.read")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !items.length ? (
              <AdminEmpty colSpan={6} message={tr("common.loading")} />
            ) : !items.length ? (
              <AdminEmpty colSpan={6} message={tr("permissions.empty")} />
            ) : (
              items.map((item) => (
                <TableRow key={`${item.vhost}/${item.user}`}>
                  <TableCell className="font-mono text-xs">{item.user}</TableCell>
                  <TableCell className="font-mono text-xs">{item.vhost}</TableCell>
                  <TableCell className="font-mono text-xs">{item.configure}</TableCell>
                  <TableCell className="font-mono text-xs">{item.write}</TableCell>
                  <TableCell className="font-mono text-xs">{item.read}</TableCell>
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
            <DialogDescription>{tr("permissions.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("permissions.user")}</Label>
              {users.length ? (
                <Select
                  value={form.user}
                  onValueChange={(user) => setForm({ ...form, user })}
                  disabled={Boolean(editing)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.name} value={user.name}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={form.user}
                  onChange={(event) => setForm({ ...form, user: event.target.value })}
                  disabled={Boolean(editing)}
                  className="h-9 font-mono text-sm"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("permissions.vhost")}</Label>
              {vhosts.length ? (
                <Select
                  value={form.vhost}
                  onValueChange={(vhost) => setForm({ ...form, vhost })}
                  disabled={Boolean(editing)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {vhosts.map((vhost) => (
                      <SelectItem key={vhost.name} value={vhost.name}>
                        {vhost.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={form.vhost}
                  onChange={(event) => setForm({ ...form, vhost: event.target.value })}
                  disabled={Boolean(editing)}
                  className="h-9 font-mono text-sm"
                />
              )}
            </div>
            {(["configure", "write", "read"] as const).map((field) => (
              <div key={field} className="space-y-1.5">
                <Label className="text-xs">{tr(`permissions.${field}`)}</Label>
                <Input
                  value={form[field]}
                  onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                  className="h-9 font-mono text-sm"
                />
              </div>
            ))}
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
