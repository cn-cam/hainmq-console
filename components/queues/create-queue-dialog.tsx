"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { usePreferences } from "@/lib/stores/preferences"
import { useT } from "@/lib/i18n/client"

interface CreateQueueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

type QueueType = "classic" | "quorum" | "stream"

export function CreateQueueDialog(props: CreateQueueDialogProps) {
  // Mount fresh per open so every field starts from a clean slate
  if (!props.open) return null
  return <CreateQueueForm {...props} />
}

function CreateQueueForm({ open, onOpenChange, onCreated }: CreateQueueDialogProps) {
  const t = useT()
  const { toast } = useToast()
  const vhostPref = usePreferences((s) => s.vhost)
  const [name, setName] = React.useState("")
  const [vhost, setVhost] = React.useState(vhostPref ?? "/")
  const [type, setType] = React.useState<QueueType>("classic")
  const [durable, setDurable] = React.useState(true)
  const [autoDelete, setAutoDelete] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const handleTypeChange = (v: string) => {
    const next = v as QueueType
    setType(next)
    // Quorum queues and streams are always durable
    if (next !== "classic") {
      setDurable(true)
      setAutoDelete(false)
    }
  }

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError(t("createQueue.required"))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        durable,
        auto_delete: autoDelete,
        arguments: type === "classic" ? {} : { "x-queue-type": type },
      }
      const res = await fetch(
        `/api/rabbitmq/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(trimmed)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(
          data?.details ||
            data?.error ||
            t("createQueue.failedStatus", { status: res.status }),
        )
        return
      }
      toast({
        title: t("createQueue.created"),
        description: t("createQueue.createdDesc", { name: trimmed, vhost }),
      })
      onOpenChange(false)
      setName("")
      onCreated?.()
    } catch {
      setError(t("createQueue.network"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createQueue.title")}</DialogTitle>
          <DialogDescription>
            {t("createQueue.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="queue-name" className="text-xs">
              {t("createQueue.name")}
            </Label>
            <Input
              id="queue-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="orders.created"
              className="h-9 font-mono text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("createQueue.vhost")}</Label>
              <Input
                value={vhost}
                onChange={(e) => setVhost(e.target.value)}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("createQueue.type")}</Label>
              <Select value={type} onValueChange={handleTypeChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">Classic</SelectItem>
                  <SelectItem value="quorum">Quorum</SelectItem>
                  <SelectItem value="stream">Stream</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <p className="text-sm">{t("createQueue.durable")}</p>
              <p className="text-[11px] text-muted-foreground">{t("createQueue.durableHint")}</p>
            </div>
            <Switch checked={durable} onCheckedChange={setDurable} disabled={type !== "classic"} />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <p className="text-sm">{t("createQueue.autoDelete")}</p>
              <p className="text-[11px] text-muted-foreground">
                {t("createQueue.autoDeleteHint")}
              </p>
            </div>
            <Switch
              checked={autoDelete}
              onCheckedChange={setAutoDelete}
              disabled={type !== "classic"}
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleCreate} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("createQueue.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
