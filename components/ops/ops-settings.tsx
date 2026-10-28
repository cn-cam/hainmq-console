"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useI18n } from "@/lib/i18n/client"
import { opsText } from "@/lib/ops/ui-text"
import { opsFetch, opsPut } from "@/lib/ops/ui"
import type { OpsSettings } from "@/lib/ops/types"

function toLocalInput(value: number | null): string {
  if (!value) return ""
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(value - offset).toISOString().slice(0, 16)
}

export function OpsSettingsForm() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [settings, setSettings] = React.useState<OpsSettings | null>(null)
  const [maintenance, setMaintenance] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const data = await opsFetch<OpsSettings>("/settings")
      setSettings(data)
      setMaintenance(toLocalInput(data.maintenanceUntil))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.loadFailed"))
    }
  }, [tr])

  React.useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0)
    return () => clearTimeout(kickoff)
  }, [load])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setMessage(null)
    try {
      const updated = await opsPut<OpsSettings>("/settings", {
        ...settings,
        maintenanceUntil: maintenance ? new Date(maintenance).getTime() : null,
      })
      setSettings(updated)
      setMaintenance(toLocalInput(updated.maintenanceUntil))
      setMessage(tr("settings.saved"))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return <div className="text-sm text-muted-foreground">{tr("common.loading")}</div>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
          {message}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {tr("tabs.settings")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("settings.pollInterval")}</Label>
              <Input
                type="number"
                value={settings.pollIntervalMs}
                onChange={(event) =>
                  setSettings({ ...settings, pollIntervalMs: Number(event.target.value) })
                }
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("settings.timezone")}</Label>
              <Input
                value={settings.timezone}
                onChange={(event) => setSettings({ ...settings, timezone: event.target.value })}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("settings.sampleRetention")}</Label>
              <Input
                type="number"
                value={settings.sampleRetentionDays}
                onChange={(event) =>
                  setSettings({ ...settings, sampleRetentionDays: Number(event.target.value) })
                }
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("settings.alertRetention")}</Label>
              <Input
                type="number"
                value={settings.alertRetentionDays}
                onChange={(event) =>
                  setSettings({ ...settings, alertRetentionDays: Number(event.target.value) })
                }
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("settings.notificationRetention")}</Label>
              <Input
                type="number"
                value={settings.notificationRetentionDays}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    notificationRetentionDays: Number(event.target.value),
                  })
                }
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("settings.maintenanceUntil")}</Label>
              <Input
                type="datetime-local"
                value={maintenance}
                onChange={(event) => setMaintenance(event.target.value)}
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">{tr("settings.maintenanceHint")}</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-sm">{tr("settings.webhookAllowPrivate")}</span>
            <Switch
              checked={settings.webhookAllowPrivate}
              onCheckedChange={(webhookAllowPrivate) =>
                setSettings({ ...settings, webhookAllowPrivate })
              }
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <span className="text-sm">{tr("settings.chatEnabled")}</span>
              <p className="text-[11px] text-muted-foreground">
                {tr("settings.chatEnabledHint")}
              </p>
            </div>
            <Switch
              checked={settings.chatEnabled}
              onCheckedChange={(chatEnabled) => setSettings({ ...settings, chatEnabled })}
            />
          </div>

          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
            {locale === "zh-CN"
              ? "运维模块使用嵌入式 SQLite 和进程内调度，仅支持单实例部署。采集间隔建议不低于 30 秒；应用停止期间不会采集和告警。"
              : "The operations module uses embedded SQLite and an in-process scheduler. It supports a single instance only. Keep the polling interval at 30 seconds or higher; monitoring pauses while the app is down."}
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> {tr("common.refresh")}
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? tr("common.loading") : tr("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
