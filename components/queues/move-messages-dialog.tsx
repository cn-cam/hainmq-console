"use client"

import * as React from "react"
import { ArrowRightLeft, Loader2 } from "lucide-react"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/lib/i18n/client"

interface MoveMessagesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  queueName: string
  vhost: string
  readyCount: number
  onMoved?: () => void
}

type MoveResult = {
  total: number
  moved: number
  requeued: number
  failed: number
  errors: string[]
}

export function MoveMessagesDialog(props: MoveMessagesDialogProps) {
  if (!props.open) return null
  return <MoveMessagesForm {...props} />
}

function MoveMessagesForm({
  open,
  onOpenChange,
  queueName,
  vhost,
  readyCount,
  onMoved,
}: MoveMessagesDialogProps) {
  const t = useT()
  const defaultTarget = queueName.endsWith(".dlq") ? queueName.slice(0, -4) : ""
  const [targetType, setTargetType] = React.useState<"queue" | "exchange">("queue")
  const [target, setTarget] = React.useState(defaultTarget)
  const [routingKey, setRoutingKey] = React.useState("")
  const [count, setCount] = React.useState(String(Math.min(Math.max(readyCount, 1), 100)))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<MoveResult | null>(null)

  const move = async () => {
    if (!target.trim()) {
      setError(t("messages.moveTargetRequired"))
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch("/api/messages/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vhost,
          sourceQueue: queueName,
          targetType,
          target: target.trim(),
          routingKey: routingKey.trim(),
          count: Number(count) || 10,
        }),
      })
      const data = (await response.json().catch(() => null)) as MoveResult | { error?: string } | null
      if (!response.ok) {
        setError(
          (data && "error" in data && data.error) || t("messages.moveFailed"),
        )
        return
      }
      setResult(data as MoveResult)
      onMoved?.()
    } catch {
      setError(t("messages.network"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            {t("messages.moveTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("messages.moveDesc", { queue: queueName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("messages.targetType")}</Label>
              <Select
                value={targetType}
                onValueChange={(value) => setTargetType(value as "queue" | "exchange")}
                disabled={busy}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="queue">{t("messages.targetQueue")}</SelectItem>
                  <SelectItem value="exchange">{t("messages.targetExchange")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("messages.count")}</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={count}
                onChange={(event) => setCount(event.target.value)}
                disabled={busy}
                className="h-9 font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t("messages.target")}</Label>
            <Input
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder={targetType === "queue" ? "orders.created" : "orders"}
              disabled={busy}
              className="h-9 font-mono text-sm"
            />
          </div>

          {targetType === "exchange" && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t("messages.routingKey")}</Label>
              <Input
                value={routingKey}
                onChange={(event) => setRoutingKey(event.target.value)}
                placeholder={t("messages.routingKeyHint")}
                disabled={busy}
                className="h-9 font-mono text-sm"
              />
            </div>
          )}

          <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-muted-foreground">
            {t("messages.moveWarning")}
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
              {t("messages.moveResult", {
                moved: result.moved,
                requeued: result.requeued,
                failed: result.failed,
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void move()} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("messages.moveAction")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
