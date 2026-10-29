import { readFile } from "node:fs/promises"
import { NextResponse } from "next/server"
import { backupPath, createBackup, deleteBackup, listBackups, stageRestore } from "./backup"
import { decryptChannelConfig, testChannel } from "./notify"
import { getMetricDefinition } from "./metrics"
import { fetchTargetJson } from "./rabbitmq"
import { approveAndExecute, rejectApproval } from "./approvals"
import { runChat, testModelProfile } from "./chat"
import { executeOpsTool } from "./mcp"
import { getDb, insertAuditLog } from "./db"
import { getSettings, updateSettings } from "./settings"
import {
  appendChatMessage,
  createChannel,
  createModelProfile,
  createRule,
  createTarget,
  deleteChannel,
  deleteLocalRole,
  deleteModelProfile,
  deleteRule,
  deleteTarget,
  ensureChatSession,
  getAlert,
  getChannelRow,
  getChatSession,
  getModelProfile,
  getTarget,
  listActiveAlerts,
  listAlerts,
  listAuditLogs,
  listChannelRows,
  listChatMessages,
  listLocalRoles,
  listModelProfiles,
  listNotifications,
  listRules,
  listTargets,
  listApprovals,
  setLocalRole,
  touchChatSession,
  updateChannel,
  updateModelProfile,
  updateRule,
  updateTarget,
} from "./store"
import {
  assertSameOrigin,
  OpsHttpError,
  requireOpsUser,
  verifyMcpToken,
} from "./auth"
import type {
  EmailConfig,
  ModelProfile,
  OpsChannelInput,
  OpsRuleInput,
  OpsTargetInput,
  OpsUser,
  WebhookConfig,
  WebhookPreset,
} from "./types"

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function parseTime(value: string | null): number | undefined {
  if (!value) return undefined
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return numeric
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new OpsHttpError(400, `${field} is required`)
  }
  return value.trim()
}

function asNumber(value: unknown, field: string, fallback?: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    if (fallback !== undefined) return fallback
    throw new OpsHttpError(400, `${field} must be a number`)
  }
  return parsed
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") return value === "true" || value === "1"
  return fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(String).filter(Boolean)
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map(Number).filter((item) => Number.isFinite(item))
}

function publicTarget(target: ReturnType<typeof listTargets>[number]) {
  return {
    id: target.id,
    name: target.name,
    host: target.host,
    port: target.port,
    protocol: target.protocol,
    vhost: target.vhost,
    username: target.username,
    enabled: target.enabled,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
  }
}

function safeChannel(row: ReturnType<typeof listChannelRows>[number]) {
  const config = decryptChannelConfig(row.configEnc) as EmailConfig | WebhookConfig
  if (row.type === "email") {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      enabled: row.enabled,
      config: { ...(config as EmailConfig), password: "" },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    enabled: row.enabled,
    config: { ...(config as WebhookConfig), secret: "" },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function latestMetrics(targetId: number, targetName: string) {
  const rows = getDb()
    .prepare(
      `SELECT s.metric, s.value, s.ts
       FROM ops_samples s
       INNER JOIN (
         SELECT metric, MAX(ts) AS max_ts
         FROM ops_samples
         WHERE target_id = ? AND object_type = 'global' AND object_name = ?
         GROUP BY metric
       ) m ON s.metric = m.metric AND s.ts = m.max_ts
       WHERE s.target_id = ? AND s.object_type = 'global' AND s.object_name = ?`,
    )
    .all(targetId, targetName, targetId, targetName) as Array<{
    metric: string
    value: number
    ts: number
  }>
  return Object.fromEntries(rows.map((row) => [row.metric, { value: row.value, ts: row.ts }]))
}

function topQueues(targetId: number) {
  return getDb()
    .prepare(
      `SELECT s.object_name AS name, s.value
       FROM ops_samples s
       INNER JOIN (
         SELECT object_name, MAX(ts) AS max_ts
         FROM ops_samples
         WHERE target_id = ? AND object_type = 'queue' AND metric = 'queue.messages'
         GROUP BY object_name
       ) m ON s.object_name = m.object_name AND s.ts = m.max_ts
       WHERE s.target_id = ? AND s.object_type = 'queue' AND s.metric = 'queue.messages'
       ORDER BY s.value DESC LIMIT 10`,
    )
    .all(targetId, targetId) as Array<{ name: string; value: number }>
}

function recentSeries(targetId: number, targetName: string, metric: string) {
  const rows = getDb()
    .prepare(
      `SELECT ts, value FROM ops_samples
       WHERE target_id = ? AND object_type = 'global' AND object_name = ? AND metric = ?
       ORDER BY ts DESC LIMIT 120`,
    )
    .all(targetId, targetName, metric) as Array<{ ts: number; value: number }>
  return rows.reverse()
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>
  } catch {
    throw new OpsHttpError(400, "Invalid JSON body")
  }
}

function requireAdmin(user: OpsUser) {
  if (user.role !== "admin") throw new OpsHttpError(403, "Admin role required")
}

function parseTargetInput(body: Record<string, unknown>, partial = false): Partial<OpsTargetInput> {
  const input: Partial<OpsTargetInput> = {}
  if (!partial || body.name !== undefined) input.name = asString(body.name, "name")
  if (!partial || body.host !== undefined) input.host = asString(body.host, "host")
  if (!partial || body.port !== undefined) input.port = asString(body.port ?? "15672", "port")
  if (!partial || body.protocol !== undefined) input.protocol = asString(body.protocol ?? "http", "protocol")
  if (body.vhost !== undefined) input.vhost = body.vhost ? String(body.vhost) : null
  if (!partial || body.username !== undefined) input.username = asString(body.username, "username")
  if (body.password !== undefined) input.password = String(body.password)
  if (body.enabled !== undefined) input.enabled = asBool(body.enabled, true)
  return input
}

function parseRuleInput(body: Record<string, unknown>, partial = false): Partial<OpsRuleInput> {
  const metricKey = body.metric === undefined ? "" : String(body.metric)
  const metric = metricKey ? getMetricDefinition(metricKey) : undefined
  if ((!partial || body.metric !== undefined) && !metric) {
    throw new OpsHttpError(400, "Unknown metric")
  }

  const input: Partial<OpsRuleInput> = {}
  if (!partial || body.name !== undefined) input.name = asString(body.name, "name")
  if (!partial || body.targetId !== undefined) input.targetId = asNumber(body.targetId, "targetId")
  if (!partial || body.scopeType !== undefined) input.scopeType = String(body.scopeType || "global") as OpsRuleInput["scopeType"]
  if (!partial || body.scopeValue !== undefined) input.scopeValue = String(body.scopeValue || "*")
  if (!partial || body.metric !== undefined) input.metric = metricKey
  if (!partial || body.operator !== undefined) input.operator = String(body.operator || ">") as OpsRuleInput["operator"]
  if (!partial || body.threshold !== undefined) input.threshold = asNumber(body.threshold, "threshold")
  if (!partial || body.durationSec !== undefined) input.durationSec = Math.max(0, asNumber(body.durationSec, "durationSec", 0))
  if (!partial || body.severity !== undefined) input.severity = String(body.severity || "warning") as OpsRuleInput["severity"]
  if (body.enabled !== undefined) input.enabled = asBool(body.enabled, true)
  if (!partial || body.channelIds !== undefined) input.channelIds = asNumberArray(body.channelIds)
  if (body.escalationChannelIds !== undefined) input.escalationChannelIds = asNumberArray(body.escalationChannelIds)
  if (body.escalationAfterSec !== undefined) input.escalationAfterSec = Math.max(0, asNumber(body.escalationAfterSec, "escalationAfterSec", 0))
  if (body.template !== undefined) input.template = body.template ? String(body.template) : null
  if (body.cooldownSec !== undefined) input.cooldownSec = Math.max(60, asNumber(body.cooldownSec, "cooldownSec", 900))

  if (metric && input.scopeType) {
    if (metric.objectType === "global" && input.scopeType !== "global") {
      throw new OpsHttpError(400, "This metric is only available at global scope")
    }
    if (metric.objectType !== "global" && input.scopeType !== metric.objectType) {
      throw new OpsHttpError(
        400,
        `This metric requires ${metric.objectType} scope`,
      )
    }
  }

  return input
}

function parseChannelInput(body: Record<string, unknown>): OpsChannelInput {
  const type = String(body.type || "email") as OpsChannelInput["type"]
  const raw = (body.config || {}) as Record<string, unknown>
  let config: EmailConfig | WebhookConfig

  if (type === "email") {
    config = {
      host: asString(raw.host, "config.host"),
      port: asNumber(raw.port, "config.port"),
      secure: asBool(raw.secure, false),
      username: String(raw.username || ""),
      password: String(raw.password || ""),
      from: asString(raw.from, "config.from"),
      fromName: raw.fromName ? String(raw.fromName) : undefined,
      to: asStringArray(raw.to),
      cc: asStringArray(raw.cc),
      replyTo: raw.replyTo ? String(raw.replyTo) : undefined,
      tlsRejectUnauthorized: raw.tlsRejectUnauthorized === undefined ? true : asBool(raw.tlsRejectUnauthorized, true),
    }
    if (!config.to.length) throw new OpsHttpError(400, "config.to must contain at least one recipient")
  } else if (type === "webhook") {
    const presets: WebhookPreset[] = [
      "generic",
      "dingtalk",
      "feishu",
      "wecom",
      "slack",
      "teams",
      "telegram",
    ]
    const preset = String(raw.preset || "generic") as WebhookPreset
    if (!presets.includes(preset)) throw new OpsHttpError(400, "Unsupported webhook preset")
    config = {
      url: asString(raw.url, "config.url"),
      method: String(raw.method || "POST").toUpperCase(),
      headers: (raw.headers || {}) as Record<string, string>,
      bodyTemplate: raw.bodyTemplate ? String(raw.bodyTemplate) : undefined,
      timeoutMs: raw.timeoutMs === undefined ? 10000 : asNumber(raw.timeoutMs, "config.timeoutMs", 10000),
      retries: raw.retries === undefined ? 3 : asNumber(raw.retries, "config.retries", 3),
      secret: raw.secret ? String(raw.secret) : undefined,
      allowPrivate: raw.allowPrivate === undefined ? false : asBool(raw.allowPrivate, false),
      preset,
      chatId: raw.chatId ? String(raw.chatId) : undefined,
    }
  } else {
    throw new OpsHttpError(400, "Unsupported channel type")
  }

  return {
    name: asString(body.name, "name"),
    type,
    config,
    enabled: asBool(body.enabled, true),
  }
}

async function handleMcp(request: Request) {
  if (!verifyMcpToken(request)) {
    return json({ error: "Invalid MCP token" }, 401)
  }
  const body = await readJson(request)
  const tool = asString(body.tool, "tool")
  const args = (body.arguments || {}) as Record<string, unknown>

  try {
    const result = await executeOpsTool(tool, args, "mcp")
    return json({ ok: true, result })
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      400,
    )
  }
}

export async function handleOpsApi(request: Request, segments: string[]) {
  try {
    if (segments[0] === "mcp") {
      return await handleMcp(request)
    }

    const method = request.method.toUpperCase()
    if (method !== "GET" && method !== "HEAD") {
      assertSameOrigin(request)
    }

    const user = await requireOpsUser("viewer")
    const resource = segments[0] || "overview"
    const id = segments[1] ? Number(segments[1]) : null

    if (resource === "me") {
      return json({
        role: user.role,
        username: user.username,
        isAdmin: user.role === "admin",
        twoPersonApproval: getSettings().twoPersonApproval,
      })
    }

    if (resource === "overview" && method === "GET") {
      const targets = listTargets().map((target) => ({
        ...publicTarget(target),
        latest: latestMetrics(target.id, target.name),
        queueTop: topQueues(target.id),
        series: {
          publish: recentSeries(target.id, target.name, "message.publish_rate"),
          deliver: recentSeries(target.id, target.name, "message.deliver_rate"),
          queued: recentSeries(target.id, target.name, "queue.messages"),
        },
      }))
      return json({
        targets,
        activeAlerts: listActiveAlerts(),
        counts: {
          targets: targets.length,
          rules: listRules().length,
          channels: listChannelRows().length,
        },
        settings: getSettings(),
      })
    }

    if (resource === "targets") {
      if (method === "GET" && !id) return json(listTargets().map(publicTarget))
      requireAdmin(user)
      if (method === "POST" && !id) {
        const input = parseTargetInput(await readJson(request)) as OpsTargetInput
        if (!input.username || !input.password) {
          throw new OpsHttpError(400, "username and password are required")
        }
        const target = createTarget(input)
        insertAuditLog({ actor: user.username, action: "target.create", target: target.name })
        return json(publicManagerTarget(target), 201)
      }
    }

    if (resource === "targets" && id) {
      requireAdmin(user)
      if (method === "PUT") {
        const input = parseTargetInput(await readJson(request), true)
        const target = updateTarget(id, input)
        if (!target) throw new OpsHttpError(404, "Target not found")
        insertAuditLog({ actor: user.username, action: "target.update", target: target.name })
        return json(publicManagerTarget(target))
      }
      if (method === "DELETE") {
        deleteTarget(id)
        insertAuditLog({ actor: user.username, action: "target.delete", target: String(id) })
        return json({ ok: true })
      }
    }

    if (resource === "targets" && id && segments[2] === "test" && method === "POST") {
      requireAdmin(user)
      const target = getTarget(id)
      if (!target) throw new OpsHttpError(404, "Target not found")
      const overview = await fetchTargetJson<Record<string, unknown>>(target, "/api/overview")
      insertAuditLog({ actor: user.username, action: "target.test", target: target.name, result: "ok" })
      return json({
        ok: true,
        node: overview.node,
        managementVersion: overview.management_version,
      })
    }

    if (resource === "rules") {
      if (method === "GET" && !id) return json(listRules())
      requireAdmin(user)
      if (method === "POST" && !id) {
        const input = parseRuleInput(await readJson(request)) as OpsRuleInput
        const rule = createRule(input)
        insertAuditLog({ actor: user.username, action: "rule.create", target: rule.name })
        return json(rule, 201)
      }
    }

    if (resource === "rules" && id) {
      requireAdmin(user)
      if (method === "PUT") {
        const rule = updateRule(id, parseRuleInput(await readJson(request), true))
        if (!rule) throw new OpsHttpError(404, "Rule not found")
        insertAuditLog({ actor: user.username, action: "rule.update", target: rule.name })
        return json(rule)
      }
      if (method === "DELETE") {
        deleteRule(id)
        insertAuditLog({ actor: user.username, action: "rule.delete", target: String(id) })
        return json({ ok: true })
      }
    }

    if (resource === "channels") {
      if (method === "GET" && !id) return json(listChannelRows().map(safeChannel))
      requireAdmin(user)
      if (method === "POST" && !id) {
        const input = parseChannelInput(await readJson(request))
        const channel = createChannel(input)
        insertAuditLog({ actor: user.username, action: "channel.create", target: channel.name })
        return json(safeChannel(getChannelRow(channel.id)!), 201)
      }
    }

    if (resource === "channels" && id) {
      requireAdmin(user)
      if (method === "PUT") {
        const body = await readJson(request)
        const existing = getChannelRow(id)
        if (!existing) throw new OpsHttpError(404, "Channel not found")
        const input = parseChannelInput(body)
        const oldConfig = decryptChannelConfig(existing.configEnc)
        if (input.type === "email" && !(input.config as EmailConfig).password) {
          ;(input.config as EmailConfig).password = (oldConfig as EmailConfig).password
        }
        if (input.type === "webhook" && !(input.config as WebhookConfig).secret) {
          ;(input.config as WebhookConfig).secret = (oldConfig as WebhookConfig).secret
        }
        const channel = updateChannel(id, input)
        insertAuditLog({ actor: user.username, action: "channel.update", target: channel?.name })
        return json(safeChannel(getChannelRow(id)!))
      }
      if (method === "DELETE") {
        deleteChannel(id)
        insertAuditLog({ actor: user.username, action: "channel.delete", target: String(id) })
        return json({ ok: true })
      }
    }

    if (resource === "channels" && id && segments[2] === "test" && method === "POST") {
      requireAdmin(user)
      const channel = getChannelRow(id)
      if (!channel) throw new OpsHttpError(404, "Channel not found")
      const response = await testChannel(
        { ...channel, config: decryptChannelConfig(channel.configEnc) },
        getSettings().webhookAllowPrivate,
      )
      insertAuditLog({ actor: user.username, action: "channel.test", target: channel.name, result: "ok" })
      return json({ ok: true, response })
    }

    if (resource === "alerts") {
      if (method === "GET" && !id) {
        const limit = Number(new URL(request.url).searchParams.get("limit") || 200)
        return json(listAlerts(Math.min(1000, Math.max(1, limit))))
      }
    }

    if (resource === "alerts" && id) {
      if (segments[2] === "notifications" && method === "GET") {
        return json(listNotifications(id))
      }
      if (method === "POST") {
        if (user.role === "viewer") throw new OpsHttpError(403, "Operator role required")
        const body = await readJson(request)
        const action = String(body.action || "")
        const alert = getAlert(id)
        if (!alert) throw new OpsHttpError(404, "Alert not found")
        const db = getDb()
        if (action === "ack") {
          db.prepare("UPDATE ops_alerts SET ack_at = ?, ack_by = ? WHERE id = ?").run(
            Date.now(),
            user.username,
            id,
          )
        } else if (action === "silence") {
          const until = body.until ? Number(body.until) : Date.now() + 3600_000
          db.prepare("UPDATE ops_alerts SET silenced_until = ? WHERE id = ?").run(until, id)
        } else if (action === "resolve") {
          db.prepare("UPDATE ops_alerts SET status = 'resolved', resolved_at = ? WHERE id = ?").run(
            Date.now(),
            id,
          )
        } else {
          throw new OpsHttpError(400, "Unknown alert action")
        }
        insertAuditLog({ actor: user.username, action: `alert.${action}`, target: String(id) })
        return json(getAlert(id))
      }
    }

    if (resource === "settings") {
      if (method === "GET") return json(getSettings())
      requireAdmin(user)
      if (method === "PUT") {
        const body = await readJson(request)
        const settings = updateSettings({
          pollIntervalMs: body.pollIntervalMs === undefined ? undefined : Math.max(5000, asNumber(body.pollIntervalMs, "pollIntervalMs")),
          sampleRetentionDays: body.sampleRetentionDays === undefined ? undefined : Math.max(1, asNumber(body.sampleRetentionDays, "sampleRetentionDays")),
          alertRetentionDays: body.alertRetentionDays === undefined ? undefined : Math.max(1, asNumber(body.alertRetentionDays, "alertRetentionDays")),
          notificationRetentionDays: body.notificationRetentionDays === undefined ? undefined : Math.max(1, asNumber(body.notificationRetentionDays, "notificationRetentionDays")),
          auditRetentionDays: body.auditRetentionDays === undefined ? undefined : Math.max(1, asNumber(body.auditRetentionDays, "auditRetentionDays")),
          backupRetentionDays: body.backupRetentionDays === undefined ? undefined : Math.max(1, asNumber(body.backupRetentionDays, "backupRetentionDays")),
          timezone: body.timezone === undefined ? undefined : String(body.timezone),
          webhookAllowPrivate: body.webhookAllowPrivate === undefined ? undefined : asBool(body.webhookAllowPrivate, false),
          chatEnabled: body.chatEnabled === undefined ? undefined : asBool(body.chatEnabled, true),
          twoPersonApproval: body.twoPersonApproval === undefined ? undefined : asBool(body.twoPersonApproval, false),
          maintenanceUntil: body.maintenanceUntil === undefined ? undefined : body.maintenanceUntil ? Number(body.maintenanceUntil) : null,
        })
        insertAuditLog({ actor: user.username, action: "settings.update", details: settings })
        return json(settings)
      }
    }

    if (resource === "audit" && method === "GET") {
      requireAdmin(user)
      const params = new URL(request.url).searchParams
      const logs = listAuditLogs({
        limit: Math.min(5000, Math.max(1, Number(params.get("limit") || 500))),
        actor: params.get("actor") || undefined,
        action: params.get("action") || undefined,
        target: params.get("target") || undefined,
        from: parseTime(params.get("from")),
        to: parseTime(params.get("to")),
      })

      if (params.get("format") === "csv") {
        const header = ["id", "ts", "actor", "action", "target", "result", "details"]
        const lines = [
          header.join(","),
          ...logs.map((entry) =>
            [
              entry.id,
              new Date(entry.ts).toISOString(),
              entry.actor,
              entry.action,
              entry.target,
              entry.result,
              entry.details === null ? "" : JSON.stringify(entry.details),
            ]
              .map(csvCell)
              .join(","),
          ),
        ]
        return new NextResponse(lines.join("\n"), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="hainmq-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
          },
        })
      }

      return json(logs)
    }

    if (resource === "local-users") {
      requireAdmin(user)
      if (method === "GET" && !segments[1]) return json(listLocalRoles())
      const username = segments[1] ? decodeURIComponent(segments[1]) : ""
      if (!username) throw new OpsHttpError(400, "username is required")
      if (method === "PUT") {
        const body = await readJson(request)
        const role = String(body.role || "")
        if (role !== "admin" && role !== "operator" && role !== "viewer") {
          throw new OpsHttpError(400, "role must be admin, operator, or viewer")
        }
        setLocalRole(username, role, user.username)
        insertAuditLog({ actor: user.username, action: "local_role.set", target: username, details: { role } })
        return json({ username, role })
      }
      if (method === "DELETE") {
        deleteLocalRole(username)
        insertAuditLog({ actor: user.username, action: "local_role.delete", target: username })
        return json({ ok: true })
      }
    }

    if (resource === "backups") {
      requireAdmin(user)
      if (method === "GET" && !segments[1]) return json(listBackups())
      if (method === "POST" && !segments[1]) {
        const backup = createBackup()
        insertAuditLog({ actor: user.username, action: "backup.create", target: backup.name })
        return json(backup, 201)
      }
    }

    if (resource === "backups" && segments[1]) {
      requireAdmin(user)
      const name = decodeURIComponent(segments[1])
      if (segments[2] === "download" && method === "GET") {
        const file = backupPath(name)
        if (!file) throw new OpsHttpError(404, "Backup not found")
        const data = await readFile(file)
        return new NextResponse(new Uint8Array(data), {
          headers: {
            "Content-Type": "application/vnd.sqlite3",
            "Content-Disposition": `attachment; filename="${name}"`,
          },
        })
      }
      if (segments[2] === "restore" && method === "POST") {
        if (!stageRestore(name)) throw new OpsHttpError(404, "Backup not found")
        insertAuditLog({ actor: user.username, action: "backup.restore", target: name })
        return json({ ok: true, restartRequired: true })
      }
      if (method === "DELETE") {
        if (!deleteBackup(name)) throw new OpsHttpError(404, "Backup not found")
        insertAuditLog({ actor: user.username, action: "backup.delete", target: name })
        return json({ ok: true })
      }
    }

    if (resource === "approvals") {
      if (method === "GET") return json(listApprovals())
    }

    if (resource === "approvals" && segments[1] && method === "POST") {
      if (user.role === "viewer") throw new OpsHttpError(403, "Operator role required")
      const body = await readJson(request)
      const action = String(body.action || "")
      if (action === "approve") {
        const result = await approveAndExecute(segments[1], user)
        return json({ ok: true, result })
      }
      if (action === "reject") {
        return json(rejectApproval(segments[1], user, body.reason ? String(body.reason) : undefined))
      }
      throw new OpsHttpError(400, "Unknown approval action")
    }

    if (resource === "models") {
      if (method === "GET" && !id) {
        return json(
          listModelProfiles().map((profile) => ({
            ...profile,
            apiKeyEnc: undefined,
            hasApiKey: Boolean(profile.apiKeyEnc),
          })),
        )
      }
      requireAdmin(user)
      if (method === "POST" && !id) {
        const body = await readJson(request)
        const profile = createModelProfile({
          name: asString(body.name, "name"),
          provider: String(body.provider || "openai-compatible") as ModelProfile["provider"],
          baseUrl: asString(body.baseUrl, "baseUrl"),
          apiKey: body.apiKey ? String(body.apiKey) : undefined,
          model: asString(body.model, "model"),
          temperature: body.temperature === undefined ? 0.2 : asNumber(body.temperature, "temperature", 0.2),
          maxTokens: body.maxTokens === undefined ? 1024 : asNumber(body.maxTokens, "maxTokens", 1024),
          systemPrompt: body.systemPrompt ? String(body.systemPrompt) : null,
          enabled: asBool(body.enabled, true),
          isDefault: asBool(body.isDefault, false),
        })
        insertAuditLog({ actor: user.username, action: "model.create", target: profile.name })
        return json({ ...profile, apiKeyEnc: undefined, hasApiKey: Boolean(profile.apiKeyEnc) }, 201)
      }
    }

    if (resource === "models" && id) {
      requireAdmin(user)
      if (method === "PUT") {
        const body = await readJson(request)
        const profile = updateModelProfile(id, {
          name: body.name === undefined ? undefined : String(body.name),
          provider: body.provider === undefined ? undefined : (String(body.provider) as ModelProfile["provider"]),
          baseUrl: body.baseUrl === undefined ? undefined : String(body.baseUrl),
          apiKey: body.apiKey === undefined ? undefined : String(body.apiKey),
          model: body.model === undefined ? undefined : String(body.model),
          temperature: body.temperature === undefined ? undefined : asNumber(body.temperature, "temperature"),
          maxTokens: body.maxTokens === undefined ? undefined : asNumber(body.maxTokens, "maxTokens"),
          systemPrompt: body.systemPrompt === undefined ? undefined : body.systemPrompt ? String(body.systemPrompt) : null,
          enabled: body.enabled === undefined ? undefined : asBool(body.enabled, true),
          isDefault: body.isDefault === undefined ? undefined : asBool(body.isDefault, false),
        })
        if (!profile) throw new OpsHttpError(404, "Model profile not found")
        insertAuditLog({ actor: user.username, action: "model.update", target: profile.name })
        return json({ ...profile, apiKeyEnc: undefined, hasApiKey: Boolean(profile.apiKeyEnc) })
      }
      if (method === "DELETE") {
        deleteModelProfile(id)
        insertAuditLog({ actor: user.username, action: "model.delete", target: String(id) })
        return json({ ok: true })
      }
    }

    if (resource === "models" && id && segments[2] === "test" && method === "POST") {
      requireAdmin(user)
      const profile = getModelProfile(id)
      if (!profile) throw new OpsHttpError(404, "Model profile not found")
      const response = await testModelProfile(profile)
      insertAuditLog({ actor: user.username, action: "model.test", target: profile.name, result: "ok" })
      return json({ ok: true, response })
    }

    if (resource === "chat" && method === "POST") {
      if (!getSettings().chatEnabled) {
        throw new OpsHttpError(403, "Operations chat is disabled")
      }
      const body = await readJson(request)
      if (body.sessionId) {
        const existingSession = getChatSession(String(body.sessionId))
        if (!existingSession || existingSession.userName !== user.username) {
          throw new OpsHttpError(403, "Chat session does not belong to this user")
        }
      }
      const profileId = body.profileId ? Number(body.profileId) : null
      const profile = profileId
        ? getModelProfile(profileId)
        : listModelProfiles().find((item) => item.enabled && item.isDefault) ||
          listModelProfiles().find((item) => item.enabled)
      if (!profile || !profile.enabled) throw new OpsHttpError(400, "No enabled model profile")

      const sessionId = ensureChatSession({
        id: body.sessionId ? String(body.sessionId) : undefined,
        userName: user.username,
        modelProfileId: profile.id,
      })
      const message = asString(body.message, "message")
      appendChatMessage({ sessionId, role: "user", content: message })
      touchChatSession(sessionId)

      const history = listChatMessages(sessionId, 30)
        .filter((entry) => entry.role === "user" || entry.role === "assistant")
        .map((entry) => ({ role: entry.role as "user" | "assistant", content: entry.content }))

      const result = await runChat(profile, history, user.username)
      appendChatMessage({
        sessionId,
        role: "assistant",
        content: result.content,
        toolCalls: result.toolCalls,
      })
      touchChatSession(sessionId)
      return json({ sessionId, content: result.content, toolCalls: result.toolCalls })
    }

    if (resource === "chat" && segments[1] === "messages" && method === "GET") {
      const sessionId = new URL(request.url).searchParams.get("sessionId") || ""
      if (!sessionId) throw new OpsHttpError(400, "sessionId is required")
      const existingSession = getChatSession(sessionId)
      if (!existingSession || existingSession.userName !== user.username) {
        throw new OpsHttpError(403, "Chat session does not belong to this user")
      }
      return json(listChatMessages(sessionId))
    }

    return json({ error: "Not found" }, 404)
  } catch (error) {
    if (error instanceof OpsHttpError) {
      return json({ error: error.message }, error.status)
    }
    console.error("[ops] API error", error)
    return json(
      { error: error instanceof Error ? error.message : "Operations API error" },
      500,
    )
  }
}

function publicManagerTarget(target: ReturnType<typeof listTargets>[number]) {
  return publicTarget(target)
}
