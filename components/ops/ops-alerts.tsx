"use client"

import * as React from "react"
import { Bell, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { useI18n } from "@/lib/i18n/client"
import { opsText } from "@/lib/ops/ui-text"
import {
  formatOpsTime,
  opsFetch,
  opsPost,
  severityClass,
  statusVariant,
} from "@/lib/ops/ui"
import type { OpsAlert, OpsNotification } from "@/lib/ops/types"
import type { OpsMe } from "./types"

export function OpsAlerts() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [alerts, setAlerts] = React.useState<OpsAlert[]>([])
  const [me, setMe] = React.useState<OpsMe | null>(null)
  const [status, setStatus] = React.useState("all")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<number | null>(null)
  const [notificationsFor, setNotificationsFor] = React.useState<OpsAlert | null>(null)
  const [notifications, setNotifications] = React.useState<OpsNotification[]>([])

  const load = React.useCallback(async () => {
    try {
      const [alertList, currentUser] = await Promise.all([
        opsFetch<OpsAlert[]>("/alerts"),
        opsFetch<OpsMe>("/me"),
      ])
      setAlerts(alertList)
      setMe(currentUser)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.loadFailed"))
    }
  }, [tr])

  React.useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0)
    const timer = setInterval(() => void load(), 15000)
    return () => {
      clearTimeout(kickoff)
      clearInterval(timer)
    }
  }, [load])

  const act = async (alert: OpsAlert, action: string) => {
    setBusy(alert.id)
    try {
      await opsPost(`/alerts/${alert.id}`, { action })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.generic"))
    } finally {
      setBusy(null)
    }
  }

  const showNotifications = async (alert: OpsAlert) => {
    setNotificationsFor(alert)
    try {
      setNotifications(await opsFetch<OpsNotification[]>(`/alerts/${alert.id}/notifications`))
    } catch {
      setNotifications([])
    }
  }

  const filtered = alerts.filter((alert) => (status === "all" ? true : alert.status === status))

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr("common.all")}</SelectItem>
            <SelectItem value="pending">{tr("alerts.pending")}</SelectItem>
            <SelectItem value="firing">{tr("alerts.firing")}</SelectItem>
            <SelectItem value="resolved">{tr("alerts.resolved")}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto h-8 gap-1.5" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> {tr("common.refresh")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("common.name")}</TableHead>
              <TableHead>{tr("alerts.object")}</TableHead>
              <TableHead>{tr("alerts.metric")}</TableHead>
              <TableHead className="text-right">{tr("alerts.value")}</TableHead>
              <TableHead className="text-right">{tr("alerts.threshold")}</TableHead>
              <TableHead>{tr("common.severity")}</TableHead>
              <TableHead>{tr("common.status")}</TableHead>
              <TableHead>{tr("common.time")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!filtered.length ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-xs text-muted-foreground">
                  {tr("alerts.empty")}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="max-w-[220px] truncate text-xs">{alert.message}</TableCell>
                  <TableCell className="font-mono text-xs">{alert.objectName}</TableCell>
                  <TableCell className="text-xs">{alert.metric}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{alert.value ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {alert.threshold ?? "—"}
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
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => void showNotifications(alert)}
                      >
                        <Bell className="h-3 w-3" />
                      </Button>
                      {me?.role !== "viewer" && alert.status !== "resolved" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            disabled={busy === alert.id}
                            onClick={() => void act(alert, "ack")}
                          >
                            {tr("alerts.ack")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px]"
                            disabled={busy === alert.id}
                            onClick={() => void act(alert, "silence")}
                          >
                            {tr("alerts.silence")}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[11px] text-destructive"
                            disabled={busy === alert.id}
                            onClick={() => void act(alert, "resolve")}
                          >
                            {tr("alerts.resolve")}
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(notificationsFor)} onOpenChange={(open) => !open && setNotificationsFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tr("alerts.notifications")}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>{tr("common.status")}</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>{tr("common.time")}</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!notifications.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                      {tr("common.noData")}
                    </TableCell>
                  </TableRow>
                ) : (
                  notifications.map((notification) => (
                    <TableRow key={notification.id}>
                      <TableCell className="text-xs">{notification.channelId}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(notification.status)}>
                          {notification.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{notification.attempts}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatOpsTime(notification.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs">
                        {notification.lastError || notification.response || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
