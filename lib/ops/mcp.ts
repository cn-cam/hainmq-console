import mcpTools from "./mcp-tools.json"
import { getDb, insertAuditLog, now } from "./db"
import { fetchTargetJson } from "./rabbitmq"
import {
  createApproval,
  getAlert,
  getApproval,
  listAlerts,
  listAuditLogs,
  listNotifications,
  listTargets,
  getTarget,
} from "./store"
import type { OpsTarget } from "./types"

export interface McpToolDefinition {
  name: string
  description: string
  write: boolean
  inputSchema: Record<string, unknown>
}

export const MCP_TOOLS = mcpTools as McpToolDefinition[]

const rateBuckets = new Map<string, number[]>()

function checkRateLimit(actor: string) {
  const limit = Number(process.env.OPS_MCP_RATE_LIMIT_PER_MINUTE || 60)
  const current = now()
  const bucket = (rateBuckets.get(actor) || []).filter((ts) => current - ts < 60_000)
  if (bucket.length >= limit) {
    throw new Error("MCP rate limit exceeded")
  }
  bucket.push(current)
  rateBuckets.set(actor, bucket)
}

function str(args: Record<string, unknown>, key: string, fallback = ""): string {
  const value = args[key]
  return typeof value === "string" ? value : fallback
}

function num(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(args[key])
  return Number.isFinite(value) ? value : fallback
}

function publicTarget(target: OpsTarget) {
  return {
    id: target.id,
    name: target.name,
    host: target.host,
    port: target.port,
    protocol: target.protocol,
    vhost: target.vhost,
    username: target.username,
    enabled: target.enabled,
  }
}

function pickTarget(targetId?: number): OpsTarget {
  if (targetId) {
    const target = getTarget(targetId)
    if (!target) throw new Error(`Target ${targetId} not found`)
    return target
  }
  const target = listTargets(true)[0]
  if (!target) throw new Error("No enabled RabbitMQ target configured")
  return target
}

function allowVhost(vhost: string) {
  const raw = process.env.OPS_MCP_ALLOWED_VHOSTS || "/"
  if (raw.trim() === "*") return
  const allowed = raw.split(",").map((value) => value.trim())
  if (!allowed.includes(vhost)) {
    throw new Error(`Vhost ${vhost} is not allowed for MCP operations`)
  }
}

function allowQueue(name: string) {
  const raw = process.env.OPS_MCP_QUEUE_PREFIXES
  if (!raw) return
  const prefixes = raw.split(",").map((value) => value.trim()).filter(Boolean)
  if (prefixes.length && !prefixes.some((prefix) => name.startsWith(prefix))) {
    throw new Error(`Queue ${name} is outside the MCP allowlist`)
  }
}

function writeEnabled() {
  return process.env.OPS_MCP_ALLOW_WRITE === "true"
}

function approval(
  action: string,
  target: OpsTarget,
  vhost: string | null,
  payload: Record<string, unknown>,
) {
  const record = createApproval({
    action,
    targetId: target.id,
    vhost,
    payload,
    requestedBy: "mcp",
  })
  insertAuditLog({
    actor: "mcp",
    action: "approval.request",
    target: record.id,
    details: { action, targetId: target.id, vhost, payload },
    result: "pending",
  })
  return {
    status: "approval_required",
    approvalId: record.id,
    approvalUrl: "/ops/approvals",
    message:
      "This is a write operation. It will not run until an authorized operator approves it in the RabbitMQ Ops UI.",
  }
}

async function queueList(target: OpsTarget, vhost?: string, name?: string) {
  const queues = await fetchTargetJson<Array<Record<string, unknown>>>(
    target,
    "/api/queues?columns=name,vhost,state,type,durable,auto_delete,consumers,consumer_utilisation,messages,messages_ready,messages_unacknowledged,memory,message_stats",
  )
  return queues
    .filter((queue) => (vhost ? queue.vhost === vhost : true))
    .filter((queue) =>
      name ? String(queue.name).toLowerCase().includes(name.toLowerCase()) : true,
    )
    .slice(0, 200)
}

export async function executeOpsTool(
  name: string,
  args: Record<string, unknown> = {},
  actor = "mcp",
): Promise<unknown> {
  checkRateLimit(actor)
  const targetId = args.target_id === undefined ? undefined : num(args, "target_id", 0)

  switch (name) {
    case "mq_list_targets":
      return listTargets().map(publicTarget)

    case "mq_get_overview": {
      const target = pickTarget(targetId)
      return fetchTargetJson(target, "/api/overview")
    }

    case "mq_list_queues": {
      const target = pickTarget(targetId)
      return queueList(target, str(args, "vhost") || undefined, str(args, "name") || undefined)
    }

    case "mq_get_queue": {
      const target = pickTarget(targetId)
      const vhost = str(args, "vhost", "/")
      const queue = str(args, "name")
      if (!queue) throw new Error("name is required")
      return fetchTargetJson(
        target,
        `/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queue)}`,
      )
    }

    case "mq_list_exchanges": {
      const target = pickTarget(targetId)
      const vhost = str(args, "vhost")
      const exchanges = await fetchTargetJson<Array<Record<string, unknown>>>(
        target,
        "/api/exchanges?columns=name,vhost,type,durable,auto_delete,internal,message_stats",
      )
      return exchanges.filter((exchange) => (vhost ? exchange.vhost === vhost : true)).slice(0, 200)
    }

    case "mq_list_bindings": {
      const target = pickTarget(targetId)
      const vhost = str(args, "vhost", "/")
      const exchange = str(args, "exchange")
      const path = exchange
        ? `/api/exchanges/${encodeURIComponent(vhost)}/${encodeURIComponent(exchange)}/bindings/source`
        : `/api/bindings/${encodeURIComponent(vhost)}`
      return fetchTargetJson(target, path)
    }

    case "mq_list_connections": {
      const target = pickTarget(targetId)
      const connections = await fetchTargetJson<Array<Record<string, unknown>>>(
        target,
        "/api/connections",
      )
      return connections.slice(0, 200).map((connection) => ({
        name: connection.name,
        user: connection.user,
        vhost: connection.vhost,
        peer_host: connection.peer_host,
        peer_port: connection.peer_port,
        state: connection.state,
        channels: connection.channels,
        protocol: connection.protocol,
        recv_oct: connection.recv_oct,
        send_oct: connection.send_oct,
        connected_at: connection.connected_at,
        client_properties: connection.client_properties,
      }))
    }

    case "mq_list_channels": {
      const target = pickTarget(targetId)
      const channels = await fetchTargetJson<Array<Record<string, unknown>>>(
        target,
        "/api/channels",
      )
      return channels.slice(0, 200).map((channel) => ({
        name: channel.name,
        number: channel.number,
        user: channel.user,
        vhost: channel.vhost,
        state: channel.state,
        prefetch_count: channel.prefetch_count,
        messages_unacknowledged: channel.messages_unacknowledged,
        consumer_count: channel.consumer_count,
        connection_details: channel.connection_details,
      }))
    }

    case "mq_list_alerts": {
      const status = str(args, "status")
      const limit = Math.min(200, Math.max(1, num(args, "limit", 50)))
      return listAlerts(limit).filter((alert) => (status ? alert.status === status : true))
    }

    case "mq_get_alert": {
      const id = num(args, "alert_id", 0)
      const alert = getAlert(id)
      if (!alert) throw new Error("Alert not found")
      return { ...alert, notifications: listNotifications(id) }
    }

    case "mq_query_metrics": {
      const target = pickTarget(targetId)
      const metric = str(args, "metric")
      if (!metric) throw new Error("metric is required")
      const sinceMinutes = Math.min(60 * 24 * 30, Math.max(1, num(args, "since_minutes", 60)))
      const limit = Math.min(2000, Math.max(1, num(args, "limit", 500)))
      const objectType = str(args, "object_type")
      const objectName = str(args, "object_name")
      const clauses = ["target_id = ?", "metric = ?", "ts >= ?"]
      const params: Array<string | number> = [target.id, metric, now() - sinceMinutes * 60_000]
      if (objectType) {
        clauses.push("object_type = ?")
        params.push(objectType)
      }
      if (objectName) {
        clauses.push("object_name = ?")
        params.push(objectName)
      }
      params.push(limit)
      return getDb()
        .prepare(
          `SELECT object_type, object_name, metric, value, ts FROM ops_samples
           WHERE ${clauses.join(" AND ")} ORDER BY ts DESC LIMIT ?`,
        )
        .all(...params)
    }

    case "mq_peek_messages": {
      if (process.env.OPS_MCP_ALLOW_PEEK !== "true") {
        throw new Error(
          "MCP message peeking is disabled (set OPS_MCP_ALLOW_PEEK=true to enable)",
        )
      }
      const target = pickTarget(targetId)
      const vhost = str(args, "vhost", "/")
      const queue = str(args, "queue")
      if (!queue) throw new Error("queue is required")
      const maxMessages = Number(process.env.OPS_MCP_MAX_MESSAGES || 10) || 10
      const count = Math.min(maxMessages, Math.max(1, num(args, "count", 10)))
      const messages = await fetchTargetJson<Array<Record<string, unknown>>>(
        target,
        `/api/queues/${encodeURIComponent(vhost)}/${encodeURIComponent(queue)}/get`,
        {
          method: "POST",
          body: JSON.stringify({ count, ackmode: "ack_requeue_true", encoding: "auto" }),
        },
      )
      return messages.slice(0, count).map((message) => ({
        ...message,
        payload:
          typeof message.payload === "string"
            ? message.payload.slice(0, 2000)
            : message.payload,
      }))
    }

    case "mq_get_node_health": {
      const target = pickTarget(targetId)
      return fetchTargetJson(target, "/api/nodes")
    }

    case "mq_search_audit_logs": {
      return listAuditLogs(Math.min(500, Math.max(1, num(args, "limit", 100))))
    }

    case "mq_get_approval": {
      const id = str(args, "approval_id")
      if (!id) throw new Error("approval_id is required")
      const record = getApproval(id)
      if (!record) throw new Error("Approval not found")
      return record
    }

    case "mq_create_queue":
    case "mq_delete_queue":
    case "mq_purge_queue":
    case "mq_publish_message":
    case "mq_create_binding":
    case "mq_delete_binding":
    case "mq_close_connection": {
      if (!writeEnabled()) {
        throw new Error("MCP write operations are disabled (OPS_MCP_ALLOW_WRITE=false)")
      }
      const target = pickTarget(targetId)
      const vhost = name === "mq_close_connection" ? null : str(args, "vhost", "/")
      if (vhost) allowVhost(vhost)
      if (name === "mq_create_queue" || name === "mq_delete_queue" || name === "mq_purge_queue") {
        allowQueue(str(args, "name"))
      }
      if (name === "mq_create_binding" || name === "mq_delete_binding") {
        allowQueue(str(args, "queue"))
      }
      return approval(name, target, vhost, args)
    }

    default:
      throw new Error(`Unknown MCP tool: ${name}`)
  }
}
