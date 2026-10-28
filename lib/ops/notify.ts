import { createHmac } from "node:crypto"
import { lookup } from "node:dns/promises"
import net from "node:net"
import nodemailer from "nodemailer"
import { decryptSecret } from "./crypto"
import type {
  EmailConfig,
  OpsAlert,
  OpsChannel,
  OpsRule,
  OpsTarget,
  Severity,
  WebhookConfig,
} from "./types"

export interface AlertPayload {
  event: "alert" | "recovery" | "test"
  title: string
  message: string
  severity: Severity
  status: string
  target: string
  objectType: string
  objectName: string
  metric: string
  value: number | null
  threshold: number | null
  startedAt: string
  resolvedAt: string | null
  timestamp: string
}

function formatDate(value: number | null | undefined, timezone: string): string | null {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(value))
  } catch {
    return new Date(value).toISOString()
  }
}

export function buildAlertPayload(
  alert: OpsAlert,
  rule: OpsRule,
  target: OpsTarget,
  timezone: string,
  event: "alert" | "recovery" = "alert",
): AlertPayload {
  const isRecovery = event === "recovery"
  const title = isRecovery
    ? `[恢复] ${rule.name}`
    : `[告警] ${rule.name}`
  const message = isRecovery
    ? `${rule.name} 已恢复：${alert.objectName} 当前值 ${alert.value ?? "-"}`
    : `${rule.name} 触发：${alert.objectName} 当前值 ${alert.value ?? "-"}，阈值 ${alert.threshold ?? "-"}`

  return {
    event,
    title,
    message,
    severity: alert.severity,
    status: isRecovery ? "resolved" : "firing",
    target: target.name,
    objectType: alert.objectType,
    objectName: alert.objectName,
    metric: alert.metric,
    value: alert.value,
    threshold: alert.threshold,
    startedAt: formatDate(alert.startedAt, timezone) ?? "",
    resolvedAt: formatDate(alert.resolvedAt, timezone),
    timestamp: new Date().toISOString(),
  }
}

export function testPayload(): AlertPayload {
  return {
    event: "test",
    title: "[测试] RabbitScout 运维通知",
    message: "这是一条来自 RabbitScout 运维模块的测试通知。",
    severity: "info",
    status: "test",
    target: "test",
    objectType: "global",
    objectName: "test",
    metric: "test",
    value: null,
    threshold: null,
    startedAt: new Date().toISOString(),
    resolvedAt: null,
    timestamp: new Date().toISOString(),
  }
}

function renderTemplate(template: string, payload: AlertPayload): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = (payload as unknown as Record<string, unknown>)[key]
    return value === undefined || value === null ? "" : String(value)
  })
}

export function renderPayloadObject(payload: AlertPayload): Record<string, unknown> {
  return { ...payload }
}

export async function sendEmail(config: EmailConfig, payload: AlertPayload): Promise<string> {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username
      ? { user: config.username, pass: config.password }
      : undefined,
    tls: {
      rejectUnauthorized: config.tlsRejectUnauthorized !== false,
    },
  })

  const text = `${payload.message}\n\n目标：${payload.target}\n对象：${payload.objectType}/${payload.objectName}\n指标：${payload.metric}\n当前值：${payload.value ?? "-"}\n阈值：${payload.threshold ?? "-"}\n时间：${payload.timestamp}`
  const info = await transporter.sendMail({
    from: config.fromName ? `"${config.fromName}" <${config.from}>` : config.from,
    to: config.to.join(","),
    cc: config.cc?.join(","),
    replyTo: config.replyTo,
    subject: payload.title,
    text,
    html: `<h2>${escapeHtml(payload.title)}</h2><p>${escapeHtml(payload.message)}</p><table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:sans-serif;font-size:13px"><tr><td>目标</td><td>${escapeHtml(payload.target)}</td></tr><tr><td>对象</td><td>${escapeHtml(payload.objectType)} / ${escapeHtml(payload.objectName)}</td></tr><tr><td>指标</td><td>${escapeHtml(payload.metric)}</td></tr><tr><td>当前值</td><td>${payload.value ?? "-"}</td></tr><tr><td>阈值</td><td>${payload.threshold ?? "-"}</td></tr><tr><td>时间</td><td>${escapeHtml(payload.timestamp)}</td></tr></table>`,
  })

  return info.messageId || "sent"
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number)
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] === 0) return true
    return false
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase()
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.")
    )
  }

  return false
}

async function assertSafeWebhookUrl(url: string, allowPrivate: boolean): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Invalid webhook URL")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Webhook URL must use http or https")
  }

  if (allowPrivate) return

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "metadata.google.internal") {
    throw new Error("Webhook URL points to a blocked host")
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Webhook URL points to a private address")
    return
  }

  const records = await lookup(hostname, { all: true, verbatim: true })
  for (const record of records) {
    if (isPrivateIp(record.address)) {
      throw new Error("Webhook URL resolves to a private address")
    }
  }
}

export async function sendWebhook(
  config: WebhookConfig,
  payload: AlertPayload,
  defaultAllowPrivate: boolean,
): Promise<string> {
  await assertSafeWebhookUrl(config.url, config.allowPrivate ?? defaultAllowPrivate)

  const body = config.bodyTemplate
    ? renderTemplate(config.bodyTemplate, payload)
    : JSON.stringify(renderPayloadObject(payload))

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(config.headers || {}),
  }

  if (config.secret) {
    const signature = createHmac("sha256", config.secret).update(body).digest("hex")
    headers["X-RabbitScout-Signature"] = `sha256=${signature}`
  }

  const response = await fetch(config.url, {
    method: config.method || "POST",
    headers,
    body,
    signal: AbortSignal.timeout(config.timeoutMs || 10000),
  })

  const text = await response.text().catch(() => "")
  if (!response.ok) {
    throw new Error(`Webhook ${response.status}: ${text.slice(0, 300)}`)
  }
  return text.slice(0, 500) || `HTTP ${response.status}`
}

export async function sendToChannel(
  channel: OpsChannel,
  payload: AlertPayload,
  defaultAllowPrivate: boolean,
): Promise<string> {
  if (channel.type === "email") {
    return sendEmail(channel.config as EmailConfig, payload)
  }
  return sendWebhook(channel.config as WebhookConfig, payload, defaultAllowPrivate)
}

export async function testChannel(channel: OpsChannel, defaultAllowPrivate: boolean): Promise<string> {
  return sendToChannel(channel, testPayload(), defaultAllowPrivate)
}

export function decryptChannelConfig(configEnc: string): EmailConfig | WebhookConfig {
  return JSON.parse(decryptSecret(configEnc)) as EmailConfig | WebhookConfig
}
