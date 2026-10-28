"use client"

import { useMemo, useState } from "react"
import { MessageSquare, Layers, Cable, Server, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { StatCard } from "@/components/dashboard/stat-card"
import { StreamingChart, type ColumnarData } from "@/components/dashboard/streaming-chart"
import { DistributionDonut } from "@/components/dashboard/distribution-donut"
import { TimeRangeSelect, TIME_RANGES, type TimeRangeKey } from "@/components/dashboard/time-range"
import { ErrorCard } from "@/components/shared/error-card"
import { AnimatedValue } from "@/components/shared/animated-value"
import { usePolling } from "@/hooks/use-polling"
import { useLiveSeries } from "@/hooks/use-live-series"
import { useT } from "@/lib/i18n/client"
import { ratesFromSamples, gaugeFromSamples, pickBaseAxis, alignToAxis } from "@/lib/chart-data"
import { formatBytes, formatUptime, formatNumber, formatRate } from "@/lib/utils"
import type { Overview, Queue, NodeStats } from "@/lib/rabbitmq/types"

const RATE_SERIES = [
  { labelKey: "series.publish", stroke: "hsl(24 95% 53%)", fill: "hsl(24 95% 53% / 0.08)" },
  { labelKey: "series.deliver", stroke: "hsl(142 66% 46%)", fill: "hsl(142 66% 46% / 0.06)" },
] as const

const QUEUED_SERIES = [
  { labelKey: "series.total", stroke: "hsl(0 72% 55%)", fill: "hsl(0 72% 55% / 0.06)" },
  { labelKey: "series.ready", stroke: "hsl(38 92% 52%)", fill: "hsl(38 92% 52% / 0.05)" },
  { labelKey: "series.unacked", stroke: "hsl(217 91% 62%)", fill: "hsl(217 91% 62% / 0.05)" },
] as const

// ── Main page ──────────────────────────────────────────────────

export default function OverviewPage() {
  const t = useT()
  const [range, setRange] = useState<TimeRangeKey>("live")
  const rangeDef = TIME_RANGES.find((r) => r.key === range)!
  const isLive = range === "live"

  const overviewUrl = isLive
    ? "/api/rabbitmq/overview"
    : `/api/rabbitmq/overview?lengths_age=${rangeDef.age}&lengths_incr=${rangeDef.incr}&msg_rates_age=${rangeDef.age}&msg_rates_incr=${rangeDef.incr}`

  const { data: overview, error, loading, lastUpdated } = usePolling<Overview>(overviewUrl)
  const { data: queues } = usePolling<Queue[]>("/api/rabbitmq/queues")
  const { data: nodeStats } = usePolling<NodeStats | null>(
    overview?.node ? `/api/rabbitmq/nodes/${encodeURIComponent(overview.node)}` : null,
  )

  // Live mode: accumulate a rolling client-side window
  const live = useLiveSeries(isLive ? overview : null, lastUpdated)

  // Historical mode: derive series from broker-retained samples.
  // The x-axis is the richest available series, so one missing series
  // never blanks the whole chart.
  const historical = useMemo(() => {
    if (isLive || !overview) return null
    const publish = ratesFromSamples(overview.message_stats?.publish_details)
    const deliver = ratesFromSamples(overview.message_stats?.deliver_get_details)
    const totals = gaugeFromSamples(overview.queue_totals?.messages_details)
    const ready = gaugeFromSamples(overview.queue_totals?.messages_ready_details)
    const unacked = gaugeFromSamples(overview.queue_totals?.messages_unacknowledged_details)

    const rateBase = pickBaseAxis(publish, deliver)
    const rateData: ColumnarData = [
      rateBase,
      alignToAxis(rateBase, publish),
      alignToAxis(rateBase, deliver),
    ]
    const queuedBase = pickBaseAxis(totals, ready, unacked)
    const queuedData: ColumnarData = [
      queuedBase,
      alignToAxis(queuedBase, totals),
      alignToAxis(queuedBase, ready),
      alignToAxis(queuedBase, unacked),
    ]
    return { rateData, queuedData }
  }, [isLive, overview])

  const rateSeries = useMemo(
    () => RATE_SERIES.map((s) => ({ label: t(s.labelKey), stroke: s.stroke, fill: s.fill })),
    [t],
  )
  const queuedSeries = useMemo(
    () => QUEUED_SERIES.map((s) => ({ label: t(s.labelKey), stroke: s.stroke, fill: s.fill })),
    [t],
  )

  const rateData: ColumnarData = isLive
    ? [live.timestamps, live.publishRates, live.deliveryRates]
    : historical?.rateData ?? [[], [], []]
  const queuedData: ColumnarData = isLive
    ? [live.timestamps, live.totalMessages, live.readyMessages, live.unackedMessages]
    : historical?.queuedData ?? [[], [], [], []]

  const queueDist = useMemo(() => {
    if (!queues) return []
    const sorted = [...queues].sort((a, b) => b.messages - a.messages)
    // Qualify names with vhost so same-named queues in different vhosts
    // stay distinct segments.
    const label = (q: Queue) => (q.vhost === "/" ? q.name : `${q.vhost}/${q.name}`)
    const top = sorted.slice(0, 6).map((q) => ({
      id: `${q.vhost}|${q.name}`,
      name: label(q),
      value: q.messages,
    }))
    if (sorted.length > 6) {
      top.push({
        id: "__others__",
        name: t("common.other"),
        value: sorted.slice(6).reduce((s, q) => s + q.messages, 0),
      })
    }
    return top
  }, [queues, t])

  if (error && !overview) {
    return <ErrorCard message={error} type="CONNECTION" />
  }
  if (loading && !overview) return <OverviewSkeleton />

  const ov = overview!
  const publishRate = ov.message_stats?.publish_details?.rate ?? 0
  const deliveryRate = ov.message_stats?.deliver_get_details?.rate ?? 0
  const hasAlarm = nodeStats?.mem_alarm || nodeStats?.disk_free_alarm

  return (
    <div className="space-y-5">
      {/* ── Stat cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t("dashboard.totalMessages")}
          value={ov.queue_totals?.messages ?? 0}
          subtitle={t("dashboard.messagesSubtitle", {
            ready: formatNumber(ov.queue_totals?.messages_ready ?? 0),
            unacked: formatNumber(ov.queue_totals?.messages_unacknowledged ?? 0),
          })}
          icon={MessageSquare}
        />
        <StatCard
          title={t("dashboard.queues")}
          value={ov.object_totals?.queues ?? 0}
          subtitle={t("dashboard.exchangesCount", {
            count: formatNumber(ov.object_totals?.exchanges ?? 0),
          })}
          icon={Layers}
        />
        <StatCard
          title={t("dashboard.connections")}
          value={ov.object_totals?.connections ?? 0}
          subtitle={t("dashboard.connectionsSubtitle", {
            channels: formatNumber(ov.object_totals?.channels ?? 0),
            consumers: formatNumber(ov.object_totals?.consumers ?? 0),
          })}
          icon={Cable}
        />
        <StatCard
          title={t("dashboard.memory")}
          value={nodeStats?.mem_used ?? 0}
          format={(n) => formatBytes(n)}
          subtitle={
            nodeStats?.uptime
              ? t("dashboard.up", { duration: formatUptime(nodeStats.uptime) })
              : undefined
          }
          icon={Server}
        />
      </div>

      {/* ── Range control ── */}
      <div className="flex items-center justify-between">
        <TimeRangeSelect value={range} onChange={setRange} />
        {hasAlarm && (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {nodeStats?.mem_alarm ? t("dashboard.memoryAlarm") : t("dashboard.diskAlarm")}
          </Badge>
        )}
      </div>

      {/* ── Charts + Cluster info row ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="flex flex-col lg:col-span-8">
          <CardHeader className="shrink-0 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("dashboard.messageRates")}
              </CardTitle>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  {t("dashboard.publish")} <span className="font-mono tnum">{formatRate(publishRate)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  {t("dashboard.deliver")} <span className="font-mono tnum">{formatRate(deliveryRate)}</span>
                </span>
                {isLive && (
                  <span className="flex items-center gap-1">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                    </span>
                    {t("dashboard.live")}
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            <StreamingChart data={rateData} series={rateSeries} yAxisFormat={(v) => `${Math.round(v)}/s`} />
          </CardContent>
        </Card>

        {/* Cluster Info */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("dashboard.cluster")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label={t("dashboard.node")} value={ov.node || "—"} mono />
            <InfoRow label={t("dashboard.rabbitmq")} value={ov.management_version || "—"} />
            <InfoRow label={t("dashboard.ratesMode")} value={ov.rates_mode || "—"} />
            {nodeStats && (
              <>
                <InfoRow label={t("dashboard.diskFree")} value={formatBytes(nodeStats.disk_free ?? 0)} mono />
                <InfoRow
                  label={t("dashboard.fileDescriptors")}
                  value={`${formatNumber(nodeStats.fd_used ?? 0)} / ${formatNumber(nodeStats.fd_total ?? 0)}`}
                  mono
                />
                <InfoRow
                  label={t("dashboard.sockets")}
                  value={`${formatNumber(nodeStats.sockets_used ?? 0)} / ${formatNumber(nodeStats.sockets_total ?? 0)}`}
                  mono
                />
                <InfoRow
                  label={t("dashboard.erlangProcesses")}
                  value={`${formatNumber(nodeStats.proc_used ?? 0)} / ${formatNumber(nodeStats.proc_total ?? 0)}`}
                  mono
                />
              </>
            )}
            {ov.listeners && ov.listeners.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
                  {t("dashboard.listeners")}
                </p>
                <div className="space-y-0.5">
                  {ov.listeners.slice(0, 4).map((l, i) => (
                    <p key={i} className="font-mono text-xs text-muted-foreground">
                      {l.protocol} :{l.port}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="flex flex-col lg:col-span-8">
          <CardHeader className="shrink-0 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t("dashboard.queuedMessages")}
              </CardTitle>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-destructive" />
                  {t("dashboard.totalMessages")} <AnimatedValue value={ov.queue_totals?.messages ?? 0} className="font-mono tnum" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-warning" />
                  {t("common.ready")} <AnimatedValue value={ov.queue_totals?.messages_ready ?? 0} className="font-mono tnum" />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-info" />
                  {t("common.unacked")} <AnimatedValue value={ov.queue_totals?.messages_unacknowledged ?? 0} className="font-mono tnum" />
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 pb-4">
            <StreamingChart data={queuedData} series={queuedSeries} yAxisFormat={(v) => v.toLocaleString()} />
          </CardContent>
        </Card>

        {/* Queue Distribution */}
        <Card className="flex flex-col lg:col-span-4">
          <CardHeader className="shrink-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dashboard.queueDistribution")}
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-[220px] flex-1">
            <DistributionDonut data={queueDist} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Helper components ──────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground/70">{label}</span>
      <span className={mono ? "font-mono text-foreground tnum" : "text-foreground"}>{value}</span>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="mb-3 h-3 w-20" />
              <Skeleton className="mb-2 h-7 w-24" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-7 w-56" />
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardContent className="p-5">
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-4">
          <CardContent className="p-5">
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardContent className="p-5">
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
        <Card className="lg:col-span-4">
          <CardContent className="p-5">
            <Skeleton className="h-[200px] w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
