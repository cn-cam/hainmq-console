import { getDb, toNumber } from "./db"
import type { OpsSettings } from "./types"

export function getSettings(): OpsSettings {
  const db = getDb()
  const rows = db.prepare("SELECT key, value FROM ops_settings").all() as Array<{
    key: string
    value: string
  }>
  const map = new Map(rows.map((row) => [row.key, row.value]))

  return {
    pollIntervalMs: Math.max(5000, toNumber(map.get("poll_interval_ms"), 60000)),
    sampleRetentionDays: Math.max(1, toNumber(map.get("sample_retention_days"), 30)),
    alertRetentionDays: Math.max(1, toNumber(map.get("alert_retention_days"), 180)),
    notificationRetentionDays: Math.max(1, toNumber(map.get("notification_retention_days"), 90)),
    timezone: map.get("timezone") || "Asia/Shanghai",
    webhookAllowPrivate: map.get("webhook_allow_private") === "true",
    chatEnabled: map.get("chat_enabled") !== "false",
    maintenanceUntil: Math.max(0, toNumber(map.get("maintenance_until"), 0)) || null,
  }
}

export function updateSettings(patch: Partial<OpsSettings>): OpsSettings {
  const db = getDb()
  const statement = db.prepare(
    "INSERT INTO ops_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  )

  const values: Record<string, string> = {}
  if (patch.pollIntervalMs !== undefined) values.poll_interval_ms = String(patch.pollIntervalMs)
  if (patch.sampleRetentionDays !== undefined) values.sample_retention_days = String(patch.sampleRetentionDays)
  if (patch.alertRetentionDays !== undefined) values.alert_retention_days = String(patch.alertRetentionDays)
  if (patch.notificationRetentionDays !== undefined) values.notification_retention_days = String(patch.notificationRetentionDays)
  if (patch.timezone !== undefined) values.timezone = patch.timezone
  if (patch.webhookAllowPrivate !== undefined) values.webhook_allow_private = String(patch.webhookAllowPrivate)
  if (patch.chatEnabled !== undefined) values.chat_enabled = String(patch.chatEnabled)
  if (patch.maintenanceUntil !== undefined) values.maintenance_until = String(patch.maintenanceUntil ?? 0)

  for (const [key, value] of Object.entries(values)) {
    statement.run(key, value)
  }

  return getSettings()
}
