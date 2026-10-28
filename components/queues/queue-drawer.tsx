"use client"

import * as React from "react"
import { Eraser, Eye, Send, Trash2, Users } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StreamingChart, type ColumnarData } from "@/components/dashboard/streaming-chart"
import { MessageViewer } from "./message-viewer"
import { PublishDialog } from "./publish-dialog"
import { DeleteQueueDialog } from "./delete-queue-dialog"
import { usePolling } from "@/hooks/use-polling"
import { useToast } from "@/hooks/use-toast"
import { useT } from "@/lib/i18n/client"
import { ratesFromSamples, pickBaseAxis, alignToAxis } from "@/lib/chart-data"
import { formatBytes, cn } from "@/lib/utils"
import type { Queue } from "@/lib/rabbitmq/types"

interface QueueDrawerProps {
  queue: Queue | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
}

const SPARK_SERIES = [
  { labelKey: "series.publish", stroke: "hsl(24 95% 53%)", fill: "hsl(24 95% 53% / 0.08)" },
  { labelKey: "series.deliver", stroke: "hsl(142 66% 46%)", fill: "hsl(142 66% 46% / 0.06)" },
] as const

export function QueueDrawer({ queue, open, onOpenChange, onChanged }: QueueDrawerProps) {
  const t = useT()
  const { toast } = useToast()
  const [viewerOpen, setViewerOpen] = React.useState(false)
  const [publishOpen, setPublishOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [purgeOpen, setPurgeOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // Detailed queue info with a 10-minute rate history for the sparkline
  const detailUrl =
    open && queue
      ? `/api/rabbitmq/queues/${encodeURIComponent(queue.vhost)}/${encodeURIComponent(queue.name)}?lengths_age=600&lengths_incr=5&msg_rates_age=600&msg_rates_incr=5`
      : null
  const { data: rawDetail, refresh } = usePolling<Queue>(detailUrl)

  // Trust the detail payload only when it matches the selected queue —
  // never render (or worse, purge/delete) under a stale identity.
  const detail =
    rawDetail && queue && rawDetail.name === queue.name && rawDetail.vhost === queue.vhost
      ? rawDetail
      : null
  const q = detail ?? queue

  const series = React.useMemo(
    () => SPARK_SERIES.map((s) => ({ label: t(s.labelKey), stroke: s.stroke, fill: s.fill })),
    [t],
  )

  const chartData: ColumnarData = React.useMemo(() => {
    const pub = ratesFromSamples(detail?.message_stats?.publish_details)
    const del = ratesFromSamples(detail?.message_stats?.deliver_get_details)
    const base = pickBaseAxis(pub, del)
    return [base, alignToAxis(base, pub), alignToAxis(base, del)]
  }, [detail])

  const handlePurge = async () => {
    if (!q) return
    setBusy(true)
    try {
      const res = await fetch(
        `/api/rabbitmq/queues/${encodeURIComponent(q.vhost)}/${encodeURIComponent(q.name)}/contents`,
        { method: "DELETE" },
      )
      if (res.ok) {
        toast({
          title: t("queueDetail.purged"),
          description: t("queueDetail.purgedDesc", { queue: q.name }),
        })
        refresh()
        onChanged?.()
      } else {
        const body = await res.json().catch(() => null)
        toast({
          variant: "destructive",
          title: t("queueDetail.purgeFailed"),
          description: body?.details || body?.error,
        })
      }
    } finally {
      setBusy(false)
      setPurgeOpen(false)
    }
  }

  if (!q) return null

  const queueType = q.type ?? (q.arguments?.["x-queue-type"] as string | undefined) ?? "classic"
  const args = Object.entries(q.arguments ?? {})

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 pr-8 font-mono text-sm">
              <span className="truncate">{q.name}</span>
              <Badge variant={queueType === "quorum" ? "info" : queueType === "stream" ? "warning" : "secondary"}>
                {queueType}
              </Badge>
              <span
                className={cn(
                  "ml-auto inline-flex items-center gap-1.5 font-sans text-xs font-normal text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    q.state === "running" ? "bg-success" : "bg-warning",
                  )}
                />
                {q.state}
              </span>
            </SheetTitle>
            <SheetDescription className="font-mono text-xs">
              {t("queueDetail.vhostLine", { vhost: q.vhost })}
              {q.durable && ` · ${t("common.durable")}`}
              {q.auto_delete && ` · ${t("common.autoDelete")}`}
              {q.exclusive && ` · ${t("common.exclusive")}`}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-5 p-5">
            {/* Counts */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: t("common.ready"), value: q.messages_ready ?? 0 },
                { label: t("common.unacked"), value: q.messages_unacknowledged ?? 0 },
                { label: t("common.total"), value: q.messages ?? 0 },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border bg-card px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                    {s.label}
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-semibold tracking-tight tnum">
                    {s.value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setViewerOpen(true)}>
                <Eye className="h-3.5 w-3.5" /> {t("queueDetail.messages")}
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPublishOpen(true)}>
                <Send className="h-3.5 w-3.5" /> {t("queueDetail.publish")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-warning hover:text-warning"
                onClick={() => setPurgeOpen(true)}
              >
                <Eraser className="h-3.5 w-3.5" /> {t("queueDetail.purge")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" /> {t("queueDetail.delete")}
              </Button>
            </div>

            <Separator />

            {/* Rate history */}
            <div>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">
                {t("queueDetail.rateHistory")}
              </h4>
              <div className="h-[160px]">
                {chartData[0].length > 1 ? (
                  <StreamingChart data={chartData} series={series} yAxisFormat={(v) => `${Math.round(v)}/s`} />
                ) : (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                    {t("queueDetail.waiting")}
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-2 text-xs">
              <Row label={t("common.consumers")} value={String(q.consumers)} />
              <Row
                label={t("queueDetail.consumerUtilisation")}
                value={
                  q.consumer_utilisation != null
                    ? `${Math.round(q.consumer_utilisation * 100)}%`
                    : "—"
                }
              />
              {q.memory != null && <Row label={t("common.memory")} value={formatBytes(q.memory)} />}
              {q.policy && <Row label={t("common.policy")} value={q.policy} />}
            </div>

            {/* Consumers */}
            {q.consumer_details && q.consumer_details.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Users className="h-3.5 w-3.5" /> {t("queueDetail.consumers", { count: q.consumer_details.length })}
                  </h4>
                  <div className="space-y-1.5">
                    {q.consumer_details.slice(0, 12).map((c) => (
                      <div
                        key={c.consumer_tag}
                        className="rounded-md border bg-card px-2.5 py-1.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono">{c.consumer_tag}</span>
                          {c.active === false ? (
                            <Badge variant="outline">{t("common.inactive")}</Badge>
                          ) : (
                            <Badge variant="success">{t("common.active")}</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-muted-foreground">
                          {c.channel_details?.connection_name} · {t("queueDetail.prefetch", { count: c.prefetch_count })}
                          {c.ack_required ? "" : ` · ${t("queueDetail.noAck")}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Arguments */}
            {args.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="mb-2 text-xs font-medium text-muted-foreground">{t("queueDetail.arguments")}</h4>
                  <div className="rounded-md border bg-card p-2.5">
                    {args.map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3 py-0.5 text-[11px]">
                        <span className="font-mono text-muted-foreground">{k}</span>
                        <span className="truncate font-mono">{JSON.stringify(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Purge confirmation */}
      <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("queueDetail.purgeTitle")}</DialogTitle>
            <DialogDescription>
              {t("queueDetail.purgeDescription", { queue: q.name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPurgeOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handlePurge} disabled={busy}>
              {busy ? t("queueDetail.purging") : t("queueDetail.purgeConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MessageViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        queueName={q.name}
        vhost={q.vhost}
        readyCount={q.messages_ready ?? 0}
        unackedCount={q.messages_unacknowledged ?? 0}
      />

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        queueName={q.name}
        vhost={q.vhost}
      />

      <DeleteQueueDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        queueName={q.name}
        vhost={q.vhost}
        onDeleted={() => {
          onOpenChange(false)
          onChanged?.()
        }}
      />
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="font-mono tnum">{value}</span>
    </div>
  )
}
