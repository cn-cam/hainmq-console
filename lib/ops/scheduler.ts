import { createBackup, pruneBackups } from "./backup"
import { hasEncryptionKey } from "./crypto"
import { getDb, insertAuditLog, now, pruneOpsData } from "./db"
import { evaluateRules, seedDefaultRules } from "./engine"
import { buildAlertPayload, decryptChannelConfig, sendToChannel } from "./notify"
import { collectTarget } from "./rabbitmq"
import { getSettings } from "./settings"
import {
  createTarget,
  getAlert,
  getChannelRow,
  getRule,
  getTarget,
  listTargets,
} from "./store"
import type { OpsNotification } from "./types"

declare global {
  var __opsSchedulerStarted: boolean | undefined
}

let lastCollectAt = 0
let lastPruneAt = 0
let lastBackupAt = Date.now()
let ticking = false

function seedDefaultTarget() {
  if (listTargets().length > 0) return
  const username = process.env.OPS_RABBITMQ_USERNAME
  const password = process.env.OPS_RABBITMQ_PASSWORD
  if (!username || !password) return
  if (!hasEncryptionKey()) {
    console.warn(
      "[ops] OPS_ENCRYPTION_KEY is not configured; skipping default target creation",
    )
    return
  }

  createTarget({
    name: "Default",
    host: process.env.RABBITMQ_HOST || "localhost",
    port: process.env.RABBITMQ_PORT || "15672",
    protocol: process.env.RABBITMQ_PROTOCOL || "http",
    vhost: null,
    username,
    password,
    enabled: true,
  })
  insertAuditLog({
    actor: "scheduler",
    action: "target.seeded",
    target: "Default",
  })
}

async function collectAllTargets() {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO ops_samples (target_id, object_type, object_name, metric, value, ts)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )

  for (const target of listTargets(true)) {
    const { samples, error } = await collectTarget(target)
    if (error) {
      console.warn(`[ops] collector error for ${target.name}: ${error}`)
    }

    if (samples.length) {
      db.exec("BEGIN")
      try {
        for (const sample of samples) {
          insert.run(
            sample.targetId,
            sample.objectType,
            sample.objectName,
            sample.metric,
            sample.value,
            sample.ts,
          )
        }
        db.exec("COMMIT")
      } catch (dbError) {
        db.exec("ROLLBACK")
        console.error("[ops] failed to store samples", dbError)
      }
    }
  }
}

function notificationRow(row: Record<string, unknown>): OpsNotification {
  return {
    id: Number(row.id),
    alertId: Number(row.alert_id),
    channelId: Number(row.channel_id),
    event: String(row.event || "alert") === "recovery" ? "recovery" : "alert",
    status: String(row.status) as OpsNotification["status"],
    attempts: Number(row.attempts),
    lastError: row.last_error ? String(row.last_error) : null,
    response: row.response ? String(row.response) : null,
    createdAt: Number(row.created_at),
    sentAt: row.sent_at ? Number(row.sent_at) : null,
    nextRetryAt: row.next_retry_at ? Number(row.next_retry_at) : null,
  }
}

async function deliverPendingNotifications() {
  const db = getDb()
  const due = db
    .prepare(
      `SELECT * FROM ops_notifications
       WHERE status IN ('pending', 'failed')
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY id ASC LIMIT 20`,
    )
    .all(now()) as Record<string, unknown>[]

  if (!due.length) return
  const settings = getSettings()
  if (settings.maintenanceUntil && settings.maintenanceUntil > now()) return

  for (const row of due) {
    const notification = notificationRow(row)
    const alert = getAlert(notification.alertId)
    if (!alert) {
      db.prepare("UPDATE ops_notifications SET status = 'failed', last_error = ? WHERE id = ?").run(
        "Alert not found",
        notification.id,
      )
      continue
    }

    const rule = getRule(alert.ruleId)
    const target = getTarget(alert.targetId)
    const channel = getChannelRow(notification.channelId)

    if (!rule || !target || !channel || !channel.enabled) {
      db.prepare(
        "UPDATE ops_notifications SET status = 'failed', last_error = ?, next_retry_at = NULL WHERE id = ?",
      ).run("Rule, target, or channel unavailable", notification.id)
      continue
    }

    const event = alert.status === "resolved" ? "recovery" : notification.event
    const payload = buildAlertPayload(alert, rule, target, settings.timezone, event)
    const channelWithConfig = {
      ...channel,
      config: decryptChannelConfig(channel.configEnc),
    }

    try {
      const response = await sendToChannel(
        channelWithConfig,
        payload,
        settings.webhookAllowPrivate,
      )
      db.prepare(
        `UPDATE ops_notifications
         SET status = 'sent', attempts = attempts + 1, response = ?, sent_at = ?, last_error = NULL, next_retry_at = NULL
         WHERE id = ?`,
      ).run(response, now(), notification.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const attempts = notification.attempts + 1
      const giveUp = attempts >= 5
      const nextRetry = giveUp ? null : now() + Math.min(300_000, 10_000 * 2 ** attempts)
      db.prepare(
        `UPDATE ops_notifications
         SET status = 'failed', attempts = ?, last_error = ?, next_retry_at = ?
         WHERE id = ?`,
      ).run(attempts, message.slice(0, 1000), nextRetry, notification.id)
    }
  }
}

async function tick() {
  if (ticking) return
  ticking = true
  try {
    const settings = getSettings()
    const current = now()

    if (current - lastCollectAt >= settings.pollIntervalMs) {
      lastCollectAt = current
      await collectAllTargets()
      evaluateRules()
    }

    await deliverPendingNotifications()

    if (current - lastPruneAt >= 60 * 60 * 1000) {
      lastPruneAt = current
      pruneOpsData()
    }

    if (current - lastBackupAt >= 24 * 60 * 60 * 1000) {
      lastBackupAt = current
      try {
        createBackup()
        pruneBackups(settings.backupRetentionDays)
      } catch (error) {
        console.error("[ops] scheduled backup failed", error)
      }
    }
  } catch (error) {
    console.error("[ops] scheduler tick failed", error)
  } finally {
    ticking = false
  }
}

export function startOpsScheduler() {
  if (globalThis.__opsSchedulerStarted) return
  globalThis.__opsSchedulerStarted = true

  getDb()
  seedDefaultTarget()
  const targets = listTargets()
  if (targets.length > 0) seedDefaultRules(targets[0].id)

  void tick()
  setInterval(() => {
    void tick()
  }, 5_000)
}
