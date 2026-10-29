"use client"

import * as React from "react"
import { Loader2, TriangleAlert } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n/client"
import type { Queue } from "@/lib/rabbitmq/types"

type BulkAction = "purge" | "delete"

interface BulkQueueDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  action: BulkAction
  queues: Queue[]
  onDone?: () => void
}

export function BulkQueueDialog(props: BulkQueueDialogProps) {
  if (!props.open) return null
  return <BulkQueueForm {...props} />
}

function BulkQueueForm({ open, onOpenChange, action, queues, onDone }: BulkQueueDialogProps) {
  const t = useT()
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<{ ok: number; failed: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    setResult(null)
    let ok = 0
    let failed = 0
    for (const queue of queues) {
      const base = `/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}`
      const url = action === "purge" ? `${base}/contents` : base
      try {
        const response = await fetch(url, { method: "DELETE" })
        if (response.ok) ok += 1
        else failed += 1
      } catch {
        failed += 1
      }
    }
    setResult({ ok, failed })
    setBusy(false)
    onDone?.()
  }

  const title = action === "purge" ? t("queues.bulkPurgeTitle") : t("queues.bulkDeleteTitle")
  const warning =
    action === "purge" ? t("queues.bulkPurgeWarning") : t("queues.bulkDeleteWarning")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-warning" />
            {title}
          </DialogTitle>
          <DialogDescription>{t("queues.bulkWarning")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-[11px] text-muted-foreground">
            {warning}
          </div>
          <div className="max-h-64 overflow-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{t("common.name")}</th>
                  <th className="px-3 py-2 font-medium">{t("common.vhost")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("common.messages")}</th>
                </tr>
              </thead>
              <tbody>
                {queues.map((queue) => (
                  <tr key={`${queue.vhost}/${queue.name}`} className="border-t">
                    <td className="px-3 py-1.5 font-mono">{queue.name}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{queue.vhost}</td>
                    <td className="px-3 py-1.5 text-right font-mono">
                      {(queue.messages ?? 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          {result && (
            <div
              className={`rounded-lg border px-3 py-2 text-xs ${
                result.failed
                  ? "border-destructive/30 bg-destructive/5 text-destructive"
                  : "border-success/30 bg-success/5 text-success"
              }`}
            >
              {t("queues.bulkResult", { ok: result.ok, failed: result.failed })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.close")}
          </Button>
          <Button
            variant={action === "delete" ? "destructive" : "default"}
            onClick={() => void run()}
            disabled={busy || Boolean(result)}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action === "purge"
              ? t("queues.bulkConfirmPurge", { count: queues.length })
              : t("queues.bulkConfirmDelete", { count: queues.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
