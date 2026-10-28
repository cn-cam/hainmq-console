import { randomUUID } from "node:crypto"
import { encryptSecret } from "./crypto"
import { getDb, jsonParse, now } from "./db"
import type {
  EmailConfig,
  ModelProfile,
  OpsAlert,
  OpsApproval,
  OpsChannel,
  OpsChannelInput,
  OpsNotification,
  OpsRule,
  OpsRuleInput,
  OpsTarget,
  OpsTargetInput,
  WebhookConfig,
} from "./types"

type Row = Record<string, unknown>

function bool(value: unknown): boolean {
  return Number(value) === 1
}

function targetFromRow(row: Row): OpsTarget {
  return {
    id: Number(row.id),
    name: String(row.name),
    host: String(row.host),
    port: String(row.port),
    protocol: String(row.protocol),
    vhost: row.vhost ? String(row.vhost) : null,
    username: String(row.username),
    passwordEnc: String(row.password_enc),
    enabled: bool(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function listTargets(enabledOnly = false): OpsTarget[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT * FROM ops_targets ${enabledOnly ? "WHERE enabled = 1" : ""} ORDER BY id ASC`,
    )
    .all() as Row[]
  return rows.map(targetFromRow)
}

export function getTarget(id: number): OpsTarget | null {
  const row = getDb().prepare("SELECT * FROM ops_targets WHERE id = ?").get(id) as Row | undefined
  return row ? targetFromRow(row) : null
}

export function createTarget(input: OpsTargetInput): OpsTarget {
  const db = getDb()
  const ts = now()
  const result = db
    .prepare(
      `INSERT INTO ops_targets
        (name, host, port, protocol, vhost, username, password_enc, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.host,
      input.port || "15672",
      input.protocol || "http",
      input.vhost || null,
      input.username,
      encryptSecret(input.password || ""),
      input.enabled === false ? 0 : 1,
      ts,
      ts,
    )
  return getTarget(Number(result.lastInsertRowid))!
}

export function updateTarget(id: number, input: Partial<OpsTargetInput>): OpsTarget | null {
  const existing = getTarget(id)
  if (!existing) return null
  const db = getDb()
  const passwordEnc =
    input.password === undefined || input.password === ""
      ? existing.passwordEnc
      : encryptSecret(input.password)

  db.prepare(
    `UPDATE ops_targets SET
      name = ?, host = ?, port = ?, protocol = ?, vhost = ?, username = ?, password_enc = ?,
      enabled = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.name ?? existing.name,
    input.host ?? existing.host,
    input.port ?? existing.port,
    input.protocol ?? existing.protocol,
    input.vhost === undefined ? existing.vhost : input.vhost,
    input.username ?? existing.username,
    passwordEnc,
    input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
    now(),
    id,
  )
  return getTarget(id)
}

export function deleteTarget(id: number) {
  getDb().prepare("DELETE FROM ops_targets WHERE id = ?").run(id)
}

function ruleFromRow(row: Row): OpsRule {
  return {
    id: Number(row.id),
    name: String(row.name),
    targetId: Number(row.target_id),
    scopeType: String(row.scope_type) as OpsRule["scopeType"],
    scopeValue: String(row.scope_value),
    metric: String(row.metric),
    operator: String(row.operator) as OpsRule["operator"],
    threshold: Number(row.threshold),
    durationSec: Number(row.duration_sec),
    severity: String(row.severity) as OpsRule["severity"],
    enabled: bool(row.enabled),
    channelIds: jsonParse<number[]>(String(row.channel_ids || "[]"), []),
    template: row.template ? String(row.template) : null,
    cooldownSec: Number(row.cooldown_sec ?? 900),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function listRules(): OpsRule[] {
  const rows = getDb().prepare("SELECT * FROM ops_rules ORDER BY id ASC").all() as Row[]
  return rows.map(ruleFromRow)
}

export function getRule(id: number): OpsRule | null {
  const row = getDb().prepare("SELECT * FROM ops_rules WHERE id = ?").get(id) as Row | undefined
  return row ? ruleFromRow(row) : null
}

export function createRule(input: OpsRuleInput): OpsRule {
  const ts = now()
  const result = getDb()
    .prepare(
      `INSERT INTO ops_rules
        (name, target_id, scope_type, scope_value, metric, operator, threshold, duration_sec,
         severity, enabled, channel_ids, template, cooldown_sec, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.targetId,
      input.scopeType,
      input.scopeValue,
      input.metric,
      input.operator,
      input.threshold,
      input.durationSec,
      input.severity,
      input.enabled === false ? 0 : 1,
      JSON.stringify(input.channelIds || []),
      input.template || null,
      input.cooldownSec ?? 900,
      ts,
      ts,
    )
  return getRule(Number(result.lastInsertRowid))!
}

export function updateRule(id: number, input: Partial<OpsRuleInput>): OpsRule | null {
  const existing = getRule(id)
  if (!existing) return null
  getDb()
    .prepare(
      `UPDATE ops_rules SET
        name = ?, target_id = ?, scope_type = ?, scope_value = ?, metric = ?, operator = ?,
        threshold = ?, duration_sec = ?, severity = ?, enabled = ?, channel_ids = ?,
        template = ?, cooldown_sec = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name ?? existing.name,
      input.targetId ?? existing.targetId,
      input.scopeType ?? existing.scopeType,
      input.scopeValue ?? existing.scopeValue,
      input.metric ?? existing.metric,
      input.operator ?? existing.operator,
      input.threshold ?? existing.threshold,
      input.durationSec ?? existing.durationSec,
      input.severity ?? existing.severity,
      input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
      JSON.stringify(input.channelIds ?? existing.channelIds),
      input.template === undefined ? existing.template : input.template,
      input.cooldownSec ?? existing.cooldownSec,
      now(),
      id,
    )
  return getRule(id)
}

export function deleteRule(id: number) {
  getDb().prepare("DELETE FROM ops_rules WHERE id = ?").run(id)
}

function channelFromRow(row: Row, includeSecrets: boolean): OpsChannel {
  const config = JSON.parse(
    includeSecrets ? String(row.config_enc) : "{}",
  ) as EmailConfig | WebhookConfig
  return {
    id: Number(row.id),
    name: String(row.name),
    type: String(row.type) as OpsChannel["type"],
    config,
    enabled: bool(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export interface OpsChannelRow extends OpsChannel {
  configEnc: string
}

export function listChannelRows(): OpsChannelRow[] {
  const rows = getDb().prepare("SELECT * FROM ops_channels ORDER BY id ASC").all() as Row[]
  return rows.map((row) => ({
    ...channelFromRow(row, false),
    configEnc: String(row.config_enc),
    enabled: bool(row.enabled),
  }))
}

export function getChannelRow(id: number): OpsChannelRow | null {
  const row = getDb().prepare("SELECT * FROM ops_channels WHERE id = ?").get(id) as Row | undefined
  if (!row) return null
  return {
    ...channelFromRow(row, false),
    configEnc: String(row.config_enc),
  }
}

export function listChannels(): OpsChannel[] {
  return listChannelRows()
}

export function createChannel(input: OpsChannelInput): OpsChannel {
  const ts = now()
  const result = getDb()
    .prepare(
      `INSERT INTO ops_channels (name, type, config_enc, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.type,
      encryptSecret(JSON.stringify(input.config)),
      input.enabled === false ? 0 : 1,
      ts,
      ts,
    )
  return getChannelRow(Number(result.lastInsertRowid))!
}

export function updateChannel(id: number, input: Partial<OpsChannelInput>): OpsChannel | null {
  const existing = getChannelRow(id)
  if (!existing) return null
  const config = input.config ?? (JSON.parse(existing.configEnc) as EmailConfig | WebhookConfig)

  getDb()
    .prepare(
      `UPDATE ops_channels SET name = ?, type = ?, config_enc = ?, enabled = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name ?? existing.name,
      input.type ?? existing.type,
      encryptSecret(JSON.stringify(config)),
      input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
      now(),
      id,
    )
  return getChannelRow(id)
}

export function deleteChannel(id: number) {
  getDb().prepare("DELETE FROM ops_channels WHERE id = ?").run(id)
}

function alertFromRow(row: Row): OpsAlert {
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

export function listAlerts(limit = 200): OpsAlert[] {
  const rows = getDb()
    .prepare("SELECT * FROM ops_alerts ORDER BY started_at DESC LIMIT ?")
    .all(limit) as Row[]
  return rows.map(alertFromRow)
}

export function getAlert(id: number): OpsAlert | null {
  const row = getDb().prepare("SELECT * FROM ops_alerts WHERE id = ?").get(id) as Row | undefined
  return row ? alertFromRow(row) : null
}

export function listActiveAlerts(): OpsAlert[] {
  const rows = getDb()
    .prepare("SELECT * FROM ops_alerts WHERE status <> 'resolved' ORDER BY started_at DESC")
    .all() as Row[]
  return rows.map(alertFromRow)
}

export function listNotifications(alertId: number): OpsNotification[] {
  const rows = getDb()
    .prepare("SELECT * FROM ops_notifications WHERE alert_id = ? ORDER BY id ASC")
    .all(alertId) as Row[]
  return rows.map((row) => ({
    id: Number(row.id),
    alertId: Number(row.alert_id),
    channelId: Number(row.channel_id),
    event: (row.event === "recovery" ? "recovery" : "alert") as OpsNotification["event"],
    status: String(row.status) as OpsNotification["status"],
    attempts: Number(row.attempts),
    lastError: row.last_error ? String(row.last_error) : null,
    response: row.response ? String(row.response) : null,
    createdAt: Number(row.created_at),
    sentAt: row.sent_at ? Number(row.sent_at) : null,
    nextRetryAt: row.next_retry_at ? Number(row.next_retry_at) : null,
  }))
}

function approvalFromRow(row: Row): OpsApproval {
  return {
    id: String(row.id),
    action: String(row.action),
    targetId: Number(row.target_id),
    vhost: row.vhost ? String(row.vhost) : null,
    payload: jsonParse<Record<string, unknown>>(String(row.payload), {}),
    status: String(row.status) as OpsApproval["status"],
    requestedBy: String(row.requested_by),
    requestedAt: Number(row.requested_at),
    decidedBy: row.decided_by ? String(row.decided_by) : null,
    decidedAt: row.decided_at ? Number(row.decided_at) : null,
    executedAt: row.executed_at ? Number(row.executed_at) : null,
    result: row.result ? String(row.result) : null,
    expiresAt: Number(row.expires_at),
  }
}

export function createApproval(input: {
  action: string
  targetId: number
  vhost: string | null
  payload: Record<string, unknown>
  requestedBy: string
  ttlMs?: number
}): OpsApproval {
  const id = randomUUID()
  const ts = now()
  const expiresAt = ts + (input.ttlMs ?? 10 * 60 * 1000)
  getDb()
    .prepare(
      `INSERT INTO ops_approvals
        (id, action, target_id, vhost, payload, status, requested_by, requested_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    )
    .run(
      id,
      input.action,
      input.targetId,
      input.vhost,
      JSON.stringify(input.payload),
      input.requestedBy,
      ts,
      expiresAt,
    )
  return getApproval(id)!
}

export function getApproval(id: string): OpsApproval | null {
  const row = getDb().prepare("SELECT * FROM ops_approvals WHERE id = ?").get(id) as Row | undefined
  return row ? approvalFromRow(row) : null
}

export function listApprovals(limit = 100): OpsApproval[] {
  const rows = getDb()
    .prepare("SELECT * FROM ops_approvals ORDER BY requested_at DESC LIMIT ?")
    .all(limit) as Row[]
  return rows.map(approvalFromRow)
}

export function updateApproval(
  id: string,
  status: OpsApproval["status"],
  actor: string,
  result: string | null = null,
) {
  const ts = now()
  getDb()
    .prepare(
      `UPDATE ops_approvals SET status = ?, decided_by = ?, decided_at = ?, executed_at = ?, result = ?
       WHERE id = ?`,
    )
    .run(status, actor, ts, status === "executed" || status === "failed" ? ts : null, result, id)
}

function modelFromRow(row: Row): ModelProfile {
  return {
    id: Number(row.id),
    name: String(row.name),
    provider: String(row.provider) as ModelProfile["provider"],
    baseUrl: String(row.base_url),
    apiKeyEnc: row.api_key_enc ? String(row.api_key_enc) : null,
    model: String(row.model),
    temperature: Number(row.temperature),
    maxTokens: Number(row.max_tokens),
    systemPrompt: row.system_prompt ? String(row.system_prompt) : null,
    enabled: bool(row.enabled),
    isDefault: bool(row.is_default),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function listModelProfiles(): ModelProfile[] {
  const rows = getDb().prepare("SELECT * FROM ops_model_profiles ORDER BY id ASC").all() as Row[]
  return rows.map(modelFromRow)
}

export function getModelProfile(id: number): ModelProfile | null {
  const row = getDb()
    .prepare("SELECT * FROM ops_model_profiles WHERE id = ?")
    .get(id) as Row | undefined
  return row ? modelFromRow(row) : null
}

export function createModelProfile(input: {
  name: string
  provider: ModelProfile["provider"]
  baseUrl: string
  apiKey?: string
  model: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string | null
  enabled?: boolean
  isDefault?: boolean
}): ModelProfile {
  const ts = now()
  if (input.isDefault) {
    getDb().prepare("UPDATE ops_model_profiles SET is_default = 0").run()
  }
  const result = getDb()
    .prepare(
      `INSERT INTO ops_model_profiles
        (name, provider, base_url, api_key_enc, model, temperature, max_tokens, system_prompt,
         enabled, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.provider,
      input.baseUrl,
      input.apiKey ? encryptSecret(input.apiKey) : null,
      input.model,
      input.temperature ?? 0.2,
      input.maxTokens ?? 1024,
      input.systemPrompt ?? null,
      input.enabled === false ? 0 : 1,
      input.isDefault ? 1 : 0,
      ts,
      ts,
    )
  return getModelProfile(Number(result.lastInsertRowid))!
}

export function updateModelProfile(
  id: number,
  input: Partial<{
    name: string
    provider: ModelProfile["provider"]
    baseUrl: string
    apiKey: string
    model: string
    temperature: number
    maxTokens: number
    systemPrompt: string | null
    enabled: boolean
    isDefault: boolean
  }>,
): ModelProfile | null {
  const existing = getModelProfile(id)
  if (!existing) return null
  if (input.isDefault) {
    getDb().prepare("UPDATE ops_model_profiles SET is_default = 0").run()
  }
  const apiKeyEnc =
    input.apiKey === undefined || input.apiKey === ""
      ? existing.apiKeyEnc
      : encryptSecret(input.apiKey)

  getDb()
    .prepare(
      `UPDATE ops_model_profiles SET
        name = ?, provider = ?, base_url = ?, api_key_enc = ?, model = ?, temperature = ?,
        max_tokens = ?, system_prompt = ?, enabled = ?, is_default = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(
      input.name ?? existing.name,
      input.provider ?? existing.provider,
      input.baseUrl ?? existing.baseUrl,
      apiKeyEnc,
      input.model ?? existing.model,
      input.temperature ?? existing.temperature,
      input.maxTokens ?? existing.maxTokens,
      input.systemPrompt === undefined ? existing.systemPrompt : input.systemPrompt,
      input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
      input.isDefault === undefined ? (existing.isDefault ? 1 : 0) : input.isDefault ? 1 : 0,
      now(),
      id,
    )
  return getModelProfile(id)
}

export function deleteModelProfile(id: number) {
  getDb().prepare("DELETE FROM ops_model_profiles WHERE id = ?").run(id)
}

export function listChatMessages(sessionId: string, limit = 50) {
  const rows = getDb()
    .prepare("SELECT * FROM ops_chat_messages WHERE session_id = ? ORDER BY id ASC LIMIT ?")
    .all(sessionId, limit) as Row[]
  return rows.map((row) => ({
    id: Number(row.id),
    sessionId: String(row.session_id),
    role: String(row.role) as "user" | "assistant" | "tool",
    content: String(row.content),
    toolCalls: row.tool_calls ? jsonParse<unknown>(String(row.tool_calls), null) : null,
    createdAt: Number(row.created_at),
  }))
}

export function appendChatMessage(input: {
  sessionId: string
  role: string
  content: string
  toolCalls?: unknown
}) {
  getDb()
    .prepare(
      "INSERT INTO ops_chat_messages (session_id, role, content, tool_calls, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      input.sessionId,
      input.role,
      input.content,
      input.toolCalls === undefined ? null : JSON.stringify(input.toolCalls),
      now(),
    )
}

export function getChatSession(id: string) {
  const row = getDb()
    .prepare("SELECT * FROM ops_chat_sessions WHERE id = ?")
    .get(id) as Row | undefined
  if (!row) return null
  return {
    id: String(row.id),
    userName: String(row.user_name),
    title: row.title ? String(row.title) : null,
    modelProfileId: row.model_profile_id ? Number(row.model_profile_id) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function ensureChatSession(input: {
  id?: string
  userName: string
  title?: string
  modelProfileId?: number | null
}): string {
  const db = getDb()
  if (input.id) {
    const existing = db.prepare("SELECT id FROM ops_chat_sessions WHERE id = ?").get(input.id)
    if (existing) return input.id
  }
  const id = input.id || randomUUID()
  const ts = now()
  db.prepare(
    "INSERT INTO ops_chat_sessions (id, user_name, title, model_profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, input.userName, input.title || "Ops chat", input.modelProfileId ?? null, ts, ts)
  return id
}

export function touchChatSession(id: string) {
  getDb().prepare("UPDATE ops_chat_sessions SET updated_at = ? WHERE id = ?").run(now(), id)
}

export function listAuditLogs(limit = 200) {
  const rows = getDb()
    .prepare("SELECT * FROM ops_audit_logs ORDER BY ts DESC LIMIT ?")
    .all(limit) as Row[]
  return rows.map((row) => ({
    id: Number(row.id),
    ts: Number(row.ts),
    actor: String(row.actor),
    action: String(row.action),
    target: row.target ? String(row.target) : null,
    details: row.details ? jsonParse<unknown>(String(row.details), null) : null,
    result: row.result ? String(row.result) : null,
  }))
}
