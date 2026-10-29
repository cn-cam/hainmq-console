export type OpsRole = "admin" | "operator" | "viewer"

export type Severity = "info" | "warning" | "critical"

export type AlertStatus = "pending" | "firing" | "resolved"

export type ChannelType = "email" | "webhook"

export type WebhookPreset =
  | "generic"
  | "dingtalk"
  | "feishu"
  | "wecom"
  | "slack"
  | "teams"
  | "telegram"

export type RuleOperator = ">" | ">=" | "<" | "<=" | "==" | "!=" | "absent"

export type ScopeType = "global" | "queue" | "exchange"

export interface OpsTarget {
  id: number
  name: string
  host: string
  port: string
  protocol: string
  vhost: string | null
  username: string
  passwordEnc: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface OpsTargetInput {
  name: string
  host: string
  port: string
  protocol: string
  vhost?: string | null
  username: string
  password?: string
  enabled?: boolean
}

export interface OpsRule {
  id: number
  name: string
  targetId: number
  scopeType: ScopeType
  scopeValue: string
  metric: string
  operator: RuleOperator
  threshold: number
  durationSec: number
  severity: Severity
  enabled: boolean
  channelIds: number[]
  escalationChannelIds: number[]
  escalationAfterSec: number
  runbookUrl: string | null
  template: string | null
  cooldownSec: number
  createdAt: number
  updatedAt: number
}

export interface OpsRuleInput {
  name: string
  targetId: number
  scopeType: ScopeType
  scopeValue: string
  metric: string
  operator: RuleOperator
  threshold: number
  durationSec: number
  severity: Severity
  enabled?: boolean
  channelIds: number[]
  escalationChannelIds?: number[]
  escalationAfterSec?: number
  runbookUrl?: string | null
  template?: string | null
  cooldownSec?: number
}

export interface EmailConfig {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
  from: string
  fromName?: string
  to: string[]
  cc?: string[]
  replyTo?: string
  tlsRejectUnauthorized?: boolean
}

export interface WebhookConfig {
  url: string
  method: string
  headers: Record<string, string>
  bodyTemplate?: string
  timeoutMs?: number
  retries?: number
  secret?: string
  allowPrivate?: boolean
  preset?: WebhookPreset
  chatId?: string
}

export interface OpsChannel {
  id: number
  name: string
  type: ChannelType
  config: EmailConfig | WebhookConfig
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface OpsChannelInput {
  name: string
  type: ChannelType
  config: EmailConfig | WebhookConfig
  enabled?: boolean
}

export interface OpsAlert {
  id: number
  ruleId: number
  targetId: number
  objectType: string
  objectName: string
  metric: string
  value: number | null
  threshold: number | null
  severity: Severity
  status: AlertStatus
  message: string | null
  startedAt: number
  resolvedAt: number | null
  ackAt: number | null
  ackBy: string | null
  silencedUntil: number | null
  lastNotifiedAt: number | null
  escalatedAt: number | null
}

export interface OpsNotification {
  id: number
  alertId: number
  channelId: number
  event: "alert" | "recovery"
  status: "pending" | "sent" | "failed"
  attempts: number
  lastError: string | null
  response: string | null
  createdAt: number
  sentAt: number | null
  nextRetryAt: number | null
}

export interface OpsApproval {
  id: string
  action: string
  targetId: number
  vhost: string | null
  payload: Record<string, unknown>
  status: "pending" | "approved" | "rejected" | "executed" | "failed" | "expired"
  requestedBy: string
  requestedAt: number
  decidedBy: string | null
  decidedAt: number | null
  firstApprovedBy: string | null
  firstApprovedAt: number | null
  executedAt: number | null
  result: string | null
  expiresAt: number
}

export interface OpsSettings {
  pollIntervalMs: number
  sampleRetentionDays: number
  alertRetentionDays: number
  notificationRetentionDays: number
  auditRetentionDays: number
  backupRetentionDays: number
  timezone: string
  webhookAllowPrivate: boolean
  chatEnabled: boolean
  twoPersonApproval: boolean
  maintenanceUntil: number | null
}

export interface ModelProfile {
  id: number
  name: string
  provider: "openai-compatible" | "ollama"
  baseUrl: string
  apiKeyEnc: string | null
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string | null
  enabled: boolean
  isDefault: boolean
  createdAt: number
  updatedAt: number
}

export interface ChatMessage {
  id: number
  sessionId: string
  role: "user" | "assistant" | "tool"
  content: string
  toolCalls: unknown | null
  createdAt: number
}

export interface OpsUser {
  role: OpsRole
  username: string
  isAdmin: boolean
}
