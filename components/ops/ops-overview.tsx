"use client"

import * as React from "react"
import { Activity, AlertTriangle, Bell, RefreshCw, Target } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  formatCompactNumber,
  formatOpsTime,
  formatRate,
  opsFetch,
  severityClass,
  statusVariant,
} from "@/lib/ops/ui"
import type { OpsOverviewResponse, OpsTargetView } from "./types"

export function OpsOverview() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [data, setData] = React.useState<OpsOverviewResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    try {
      setData(await opsFetch<OpsOverviewResponse>("/overview"))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.loadFailed"))
    } finally {
      setLoading(false)
    }
  }, [tr])

  React.useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0)
    const timer = setInterval(() => void load(), 10000)
    return () => {
      clearTimeout(kickoff)
      clearInterval(timer)
    }
  }, [load])

  const lastUpdated = data
    ? Math.max(0, ...data.targets.flatMap((target) => Object.values(target.latest).map((m) => m.ts)))
    : 0

  if (loading && !data) {
    return <div className="text-sm text-muted-foreground">{tr("common.loading")}</div>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={Target}
          label={tr("overview.targets")}
          value={data?.counts.targets ?? 0}
        />
        <SummaryCard
          icon={AlertTriangle}
          label={tr("overview.activeAlerts")}
          value={data?.activeAlerts.length ?? 0}
          danger={Boolean(data?.activeAlerts.length)}
        />
        <SummaryCard icon={Activity} label={tr("overview.rules")} value={data?.counts.rules ?? 0} />
        <SummaryCard icon={Bell} label={tr("overview.channels")} value={data?.counts.channels ?? 0} />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {tr("overview.lastUpdated")}: {formatOpsTime(lastUpdated)}
        </p>
        <Button variant="outline" size="sm" className="h-7 gap-1.5" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> {tr("common.refresh")}
        </Button>
      </div>

      {data?.targets.map((target) => (
        <TargetCard key={target.id} target={target} />
      ))}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {tr("overview.activeAlerts")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!data?.activeAlerts.length ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {tr("overview.noAlerts")}
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("common.name")}</TableHead>
                    <TableHead>{tr("alerts.object")}</TableHead>
                    <TableHead>{tr("alerts.metric")}</TableHead>
                    <TableHead className="text-right">{tr("alerts.value")}</TableHead>
                    <TableHead>{tr("common.severity")}</TableHead>
                    <TableHead>{tr("common.status")}</TableHead>
                    <TableHead>{tr("common.time")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.activeAlerts.slice(0, 20).map((alert) => (
                    <TableRow key={alert.id}>
                      <TableCell className="text-xs">{alert.ruleId}</TableCell>
                      <TableCell className="font-mono text-xs">{alert.objectName}</TableCell>
                      <TableCell className="text-xs">{alert.metric}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {alert.value ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs ${severityClass(alert.severity)}`}>
                          {tr(`severity.${alert.severity}` as Parameters<typeof opsText>[1])}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(alert.status)}>
                          {tr(`alerts.${alert.status}` as Parameters<typeof opsText>[1])}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatOpsTime(alert.startedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {data?.targets.map((target) => (
        <Card key={`top-${target.id}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {tr("overview.topQueues")} · {target.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!target.queueTop.length ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {tr("common.noData")}
              </p>
            ) : (
              <div className="space-y-1.5">
                {target.queueTop.map((queue) => (
                  <div key={queue.name} className="flex items-center justify-between text-xs">
                    <span className="truncate font-mono text-muted-foreground">{queue.name}</span>
                    <span className="font-mono font-medium">{formatCompactNumber(queue.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  danger,
}: {
  icon: typeof Target
  label: string
  value: number
  danger?: boolean
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70">{label}</p>
          <p className={`font-mono text-xl font-semibold ${danger ? "text-destructive" : ""}`}>
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function TargetCard({ target }: { target: OpsTargetView }) {
  const { locale } = useI18n()
  const tr = (key: Parameters<typeof opsText>[1]) => opsText(locale, key)
  const reachable = target.latest["service.reachable"]?.value === 1
  const metric = (key: string) => target.latest[key]?.value
  const updatedAt = target.latest["service.reachable"]?.ts

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {target.name}
              <Badge variant={reachable ? "success" : "destructive"}>
                {reachable ? tr("overview.reachable") : tr("overview.unreachable")}
              </Badge>
              {metric("node.mem_alarm") === 1 && (
                <Badge variant="destructive">{tr("overview.memoryAlarm")}</Badge>
              )}
              {metric("node.disk_alarm") === 1 && (
                <Badge variant="destructive">{tr("overview.diskAlarm")}</Badge>
              )}
            </CardTitle>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {target.protocol}://{target.host}:{target.port} · {target.username}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {tr("overview.lastUpdated")}: {formatOpsTime(updatedAt)}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Metric label={tr("overview.queues")} value={formatCompactNumber(metric("overview.queues"))} />
          <Metric label={tr("overview.connections")} value={formatCompactNumber(metric("overview.connections"))} />
          <Metric label={tr("overview.consumers")} value={formatCompactNumber(metric("overview.consumers"))} />
          <Metric label={tr("overview.publishRate")} value={formatRate(metric("message.publish_rate"))} />
          <Metric label={tr("overview.deliverRate")} value={formatRate(metric("message.deliver_rate"))} />
          <Metric
            label={tr("overview.service")}
            value={formatCompactNumber(metric("service.response_ms"))}
            suffix="ms"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold">
        {value}
        {suffix ? <span className="ml-1 text-[10px] text-muted-foreground">{suffix}</span> : null}
      </p>
    </div>
  )
}
