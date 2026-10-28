import fs from "node:fs"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

let database: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (database) return database

  const file = process.env.OPS_DB_PATH || path.join(process.cwd(), "data", "ops.db")
  fs.mkdirSync(path.dirname(file), { recursive: true })

  const db = new DatabaseSync(file)
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")
  db.exec("PRAGMA busy_timeout = 5000")
  initSchema(db)
  seedSettings(db)
  database = db
  return db
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ops_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ops_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      host TEXT NOT NULL,
      port TEXT NOT NULL DEFAULT '15672',
      protocol TEXT NOT NULL DEFAULT 'http',
      vhost TEXT,
      username TEXT NOT NULL,
      password_enc TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ops_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_id INTEGER NOT NULL,
      object_type TEXT NOT NULL,
      object_name TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ops_samples_lookup
      ON ops_samples(target_id, object_type, object_name, metric, ts);
    CREATE INDEX IF NOT EXISTS idx_ops_samples_time
      ON ops_samples(ts);

    CREATE TABLE IF NOT EXISTS ops_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      scope_type TEXT NOT NULL DEFAULT 'global',
      scope_value TEXT NOT NULL DEFAULT '*',
      metric TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT '>',
      threshold REAL NOT NULL DEFAULT 0,
      duration_sec INTEGER NOT NULL DEFAULT 0,
      severity TEXT NOT NULL DEFAULT 'warning',
      enabled INTEGER NOT NULL DEFAULT 1,
      channel_ids TEXT NOT NULL DEFAULT '[]',
      template TEXT,
      cooldown_sec INTEGER NOT NULL DEFAULT 900,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ops_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      object_type TEXT NOT NULL,
      object_name TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL,
      threshold REAL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      started_at INTEGER NOT NULL,
      resolved_at INTEGER,
      ack_at INTEGER,
      ack_by TEXT,
      silenced_until INTEGER,
      last_notified_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_alerts_active
      ON ops_alerts(rule_id, target_id, object_type, object_name)
      WHERE status <> 'resolved';
    CREATE INDEX IF NOT EXISTS idx_ops_alerts_status ON ops_alerts(status, started_at);

    CREATE TABLE IF NOT EXISTS ops_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config_enc TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ops_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      event TEXT NOT NULL DEFAULT 'alert',
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      response TEXT,
      created_at INTEGER NOT NULL,
      sent_at INTEGER,
      next_retry_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ops_notifications_due
      ON ops_notifications(status, next_retry_at);

    CREATE TABLE IF NOT EXISTS ops_approvals (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      vhost TEXT,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT NOT NULL,
      requested_at INTEGER NOT NULL,
      decided_by TEXT,
      decided_at INTEGER,
      executed_at INTEGER,
      result TEXT,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ops_approvals_status
      ON ops_approvals(status, requested_at);

    CREATE TABLE IF NOT EXISTS ops_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      details TEXT,
      result TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_ops_audit_time ON ops_audit_logs(ts);

    CREATE TABLE IF NOT EXISTS ops_model_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'openai-compatible',
      base_url TEXT NOT NULL,
      api_key_enc TEXT,
      model TEXT NOT NULL,
      temperature REAL NOT NULL DEFAULT 0.2,
      max_tokens INTEGER NOT NULL DEFAULT 1024,
      system_prompt TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ops_chat_sessions (
      id TEXT PRIMARY KEY,
      user_name TEXT NOT NULL,
      title TEXT,
      model_profile_id INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ops_chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ops_chat_messages_session
      ON ops_chat_messages(session_id, id);
  `)
}

const DEFAULT_SETTINGS: Record<string, string> = {
  poll_interval_ms: process.env.OPS_POLL_INTERVAL_MS || "60000",
  sample_retention_days: process.env.OPS_SAMPLE_RETENTION_DAYS || "30",
  alert_retention_days: process.env.OPS_ALERT_RETENTION_DAYS || "180",
  notification_retention_days: process.env.OPS_NOTIFICATION_RETENTION_DAYS || "90",
  timezone: process.env.OPS_TIMEZONE || "Asia/Shanghai",
  webhook_allow_private: process.env.OPS_WEBHOOK_ALLOW_PRIVATE || "false",
  chat_enabled: process.env.OPS_CHAT_ENABLED || "true",
  maintenance_until: "0",
}

function seedSettings(db: DatabaseSync) {
  const statement = db.prepare("INSERT OR IGNORE INTO ops_settings (key, value) VALUES (?, ?)")
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    statement.run(key, value)
  }
}

export function now(): number {
  return Date.now()
}

export function jsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true"
  return fallback
}

export function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sanitizeForAudit(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]"
  if (typeof value === "string") {
    return value.length > 1000 ? `${value.slice(0, 1000)}…` : value
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForAudit(item, depth + 1))
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (/password|secret|token|apikey|authorization/i.test(key)) {
        output[key] = "***"
      } else if (key === "payload" && typeof item === "string") {
        output[key] = `[redacted ${Buffer.byteLength(item)} bytes]`
      } else {
        output[key] = sanitizeForAudit(item, depth + 1)
      }
    }
    return output
  }
  return value
}

export function insertAuditLog(input: {
  actor: string
  action: string
  target?: string | null
  details?: unknown
  result?: string | null
}) {
  const db = getDb()
  db.prepare(
    "INSERT INTO ops_audit_logs (ts, actor, action, target, details, result) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    now(),
    input.actor,
    input.action,
    input.target ?? null,
    input.details === undefined ? null : JSON.stringify(sanitizeForAudit(input.details)),
    input.result ?? null,
  )
}

export function pruneOpsData() {
  const db = getDb()
  const settings = db.prepare("SELECT key, value FROM ops_settings").all() as Array<{
    key: string
    value: string
  }>
  const map = new Map(settings.map((row) => [row.key, row.value]))

  const sampleDays = Number(map.get("sample_retention_days") ?? 30)
  const alertDays = Number(map.get("alert_retention_days") ?? 180)
  const notificationDays = Number(map.get("notification_retention_days") ?? 90)
  const current = now()

  db.prepare("DELETE FROM ops_samples WHERE ts < ?").run(
    current - sampleDays * 24 * 60 * 60 * 1000,
  )
  db.prepare("DELETE FROM ops_alerts WHERE status = 'resolved' AND resolved_at < ?").run(
    current - alertDays * 24 * 60 * 60 * 1000,
  )
  db.prepare("DELETE FROM ops_notifications WHERE created_at < ?").run(
    current - notificationDays * 24 * 60 * 60 * 1000,
  )
}
