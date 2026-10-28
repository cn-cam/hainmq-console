import { getDb, insertAuditLog, now } from "./db"
import { compareValue, matchScope } from "./metrics"
import { getSettings } from "./settings"
import { createRule, listRules, listTargets } from "./store"
import type { OpsAlert, OpsRule } from "./types"

interface LatestSample {
  object_name: string
  value: number
  ts: number
}

function latestGlobal(targetId: number, targetName: string, metric: string, since: number) {
  return getDb()
    .prepare(
      `SELECT value, ts FROM ops_samples
       WHERE target_id = ? AND object_type = 'global' AND object_name = ? AND metric = ? AND ts >= ?
       ORDER BY ts DESC LIMIT 1`,
    )
    .get(targetId, targetName, metric, since) as { value: number; ts: number } | undefined
}

function latestObjects(
  targetId: number,
  objectType: string,
  metric: string,
  since: number,
): LatestSample[] {
  return getDb()
    .prepare(
      `SELECT s.object_name, s.value, s.ts
       FROM ops_samples s
       INNER JOIN (
         SELECT object_name, MAX(ts) AS max_ts
         FROM ops_samples
         WHERE target_id = ? AND object_type = ? AND metric = ? AND ts >= ?
         GROUP BY object_name
       ) m ON s.object_name = m.object_name AND s.ts = m.max_ts
       WHERE s.target_id = ? AND s.object_type = ? AND s.metric = ?`,
    )
    .all(targetId, objectType, metric, since, targetId, objectType, metric) as unknown as LatestSample[]
}

function findActiveAlert(rule: OpsRule, objectName: string): OpsAlert | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM ops_alerts
       WHERE rule_id = ? AND target_id = ? AND object_type = ? AND object_name = ? AND status <> 'resolved'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(rule.id, rule.targetId, rule.scopeType, objectName) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: Number(row.id),
    ruleId: Number(row.rule_id),
    targetId: Number(row.target_id),
    objectType: String(row.object_type),
    objectName: String(row.object_name),
    metric: String(row.metric),
    value: row.value === null ? null : Number(row.value),
    threshold: row.threshold === null ? null : Number(row.threshold),
    severity: String(row.severity) as OpsAlert["severity"],
    status: String(row.status) as OpsAlert["status"],
    message: row.message ? String(row.message) : null,
    startedAt: Number(row.started_at),
    resolvedAt: row.resolved_at ? Number(row.resolved_at) : null,
    ackAt: row.ack_at ? Number(row.ack_at) : null,
    ackBy: row.ack_by ? String(row.ack_by) : null,
    silencedUntil: row.silenced_until ? Number(row.silenced_until) : null,
    lastNotifiedAt: row.last_notified_at ? Number(row.last_notified_at) : null,
  }
}

function createAlert(rule: OpsRule, objectName: string, value: number): OpsAlert {
  const ts = now()
  const message = `${rule.name}: ${objectName} 当前值 ${value}，阈值 ${rule.operator} ${rule.threshold}`
  getDb()
    .prepare(
      `INSERT INTO ops_alerts
        (rule_id, target_id, object_type, object_name, metric, value, threshold, severity, status,
         message, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .run(
      rule.id,
      rule.targetId,
      rule.scopeType,
      objectName,
      rule.metric,
      value,
      rule.threshold,
      rule.severity,
      message,
      ts,
    )
  return findActiveAlert(rule, objectName)!
}

function fireAlert(alert: OpsAlert, rule: OpsRule) {
  const db = getDb()
  const ts = now()
  db.prepare(
    "UPDATE ops_alerts SET status = 'firing', value = ?, last_notified_at = ? WHERE id = ?",
  ).run(alert.value, ts, alert.id)

  if (alert.silencedUntil && alert.silencedUntil > ts) return
  const settings = getSettings()
  if (settings.maintenanceUntil && settings.maintenanceUntil > ts) return

  createNotifications(alert.id, rule, "alert")
  insertAuditLog({
    actor: "scheduler",
    action: "alert.firing",
    target: alert.objectName,
    details: { ruleId: rule.id, value: alert.value, threshold: rule.threshold },
  })
}

function resolveAlert(alert: OpsAlert, rule: OpsRule) {
  const db = getDb()
  const ts = now()
  db.prepare(
    "UPDATE ops_alerts SET status = 'resolved', resolved_at = ? WHERE id = ?",
  ).run(ts, alert.id)

  const settings = getSettings()
  if (!settings.maintenanceUntil || settings.maintenanceUntil <= ts) {
    createNotifications(alert.id, rule, "recovery")
  }
  insertAuditLog({
    actor: "scheduler",
    action: "alert.resolved",
    target: alert.objectName,
    details: { ruleId: rule.id },
  })
}

function createNotifications(alertId: number, rule: OpsRule, event: "alert" | "recovery") {
  if (!rule.channelIds.length) return
  const db = getDb()
  const statement = db.prepare(
    `INSERT INTO ops_notifications (alert_id, channel_id, event, status, attempts, created_at)
     VALUES (?, ?, ?, 'pending', 0, ?)`,
  )
  for (const channelId of rule.channelIds) {
    statement.run(alertId, channelId, event, now())
  }
}

export function evaluateRules() {
  const rules = listRules().filter((rule) => rule.enabled)
  if (!rules.length) return

  const settings = getSettings()
  const lookbackMs = Math.max(settings.pollIntervalMs * 3, 120_000)
  const since = now() - lookbackMs
  const targets = new Map(listTargets().map((target) => [target.id, target]))

  for (const rule of rules) {
    const target = targets.get(rule.targetId)
    if (!target || !target.enabled) continue

    const objects: Array<{ name: string; value: number }> = []

    if (rule.scopeType === "global") {
      const sample = latestGlobal(rule.targetId, target.name, rule.metric, since)
      if (sample) objects.push({ name: target.name, value: sample.value })
    } else {
      const samples = latestObjects(rule.targetId, rule.scopeType, rule.metric, since)
      for (const sample of samples) {
        if (!matchScope(rule.scopeValue, sample.object_name)) continue
        objects.push({ name: sample.object_name, value: sample.value })
      }
    }

    for (const object of objects) {
      const condition = compareValue(object.value, rule.operator, rule.threshold)
      const active = findActiveAlert(rule, object.name)

      if (condition) {
        if (!active) {
          const pending = createAlert(rule, object.name, object.value)
          if (rule.durationSec <= 0) {
            fireAlert(pending, rule)
          }
        } else if (active.status === "pending") {
          getDb()
            .prepare("UPDATE ops_alerts SET value = ?, message = ? WHERE id = ?")
            .run(
              object.value,
              `${rule.name}: ${object.name} 当前值 ${object.value}，阈值 ${rule.operator} ${rule.threshold}`,
              active.id,
            )
          if (now() - active.startedAt >= rule.durationSec * 1000) {
            fireAlert({ ...active, value: object.value }, rule)
          }
        } else if (active.status === "firing") {
          getDb().prepare("UPDATE ops_alerts SET value = ? WHERE id = ?").run(object.value, active.id)
          const cooldownMs = Math.max(60_000, rule.cooldownSec * 1000)
          if (
            active.lastNotifiedAt &&
            now() - active.lastNotifiedAt >= cooldownMs &&
            (!active.silencedUntil || active.silencedUntil <= now())
          ) {
            getDb()
              .prepare("UPDATE ops_alerts SET last_notified_at = ? WHERE id = ?")
              .run(now(), active.id)
            createNotifications(active.id, rule, "alert")
          }
        }
      } else if (active) {
        if (active.status === "firing") {
          resolveAlert(active, rule)
        } else {
          getDb().prepare("DELETE FROM ops_alerts WHERE id = ?").run(active.id)
        }
      }
    }
  }
}

export function seedDefaultRules(targetId: number) {
  if (listRules().length > 0) return
  const base = {
    targetId,
    scopeType: "global" as const,
    scopeValue: "*",
    channelIds: [] as number[],
    enabled: true,
    cooldownSec: 900,
  }

  createRule({
    ...base,
    name: "RabbitMQ 服务不可达",
    metric: "service.reachable",
    operator: "<",
    threshold: 1,
    durationSec: 60,
    severity: "critical",
  })
  createRule({
    ...base,
    name: "内存告警",
    metric: "node.mem_alarm",
    operator: ">",
    threshold: 0,
    durationSec: 0,
    severity: "critical",
  })
  createRule({
    ...base,
    name: "磁盘告警",
    metric: "node.disk_alarm",
    operator: ">",
    threshold: 0,
    durationSec: 0,
    severity: "critical",
  })
  createRule({
    ...base,
    name: "队列有消息但无消费者",
    scopeType: "queue",
    metric: "queue.messages_without_consumers",
    operator: ">",
    threshold: 0,
    durationSec: 300,
    severity: "warning",
  })
  createRule({
    ...base,
    name: "队列就绪消息积压",
    scopeType: "queue",
    metric: "queue.messages_ready",
    operator: ">",
    threshold: 10000,
    durationSec: 300,
    severity: "warning",
  })
  createRule({
    ...base,
    name: "队列未确认消息过多",
    scopeType: "queue",
    metric: "queue.messages_unacked",
    operator: ">",
    threshold: 1000,
    durationSec: 300,
    severity: "warning",
  })
  createRule({
    ...base,
    name: "不可路由消息增长",
    metric: "message.unroutable_rate",
    operator: ">",
    threshold: 0,
    durationSec: 300,
    severity: "warning",
  })
}
