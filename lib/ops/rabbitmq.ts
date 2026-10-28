import { decryptSecret } from "./crypto"
import type { OpsTarget } from "./types"

export interface OpsSampleInput {
  targetId: number
  objectType: string
  objectName: string
  metric: string
  value: number
  ts: number
}

interface OverviewResponse {
  node?: string
  object_totals?: {
    connections?: number
    channels?: number
    consumers?: number
    queues?: number
    exchanges?: number
  }
  message_stats?: {
    publish_details?: { rate?: number }
    deliver_get_details?: { rate?: number }
    redeliver_details?: { rate?: number }
    return_unroutable_details?: { rate?: number }
  }
}

interface NodeResponse {
  name: string
  mem_used?: number
  mem_alarm?: boolean
  disk_free?: number
  disk_free_alarm?: boolean
  fd_used?: number
  fd_total?: number
  sockets_used?: number
  sockets_total?: number
  uptime?: number
}

interface QueueResponse {
  name: string
  vhost: string
  state?: string
  consumers?: number
  consumer_utilisation?: number | null
  messages?: number
  messages_ready?: number
  messages_unacknowledged?: number
  memory?: number
  message_stats?: {
    publish_details?: { rate?: number }
    deliver_get_details?: { rate?: number }
  }
}

interface ExchangeResponse {
  name: string
  vhost: string
  message_stats?: {
    publish_in_details?: { rate?: number }
    publish_out_details?: { rate?: number }
  }
}

function targetBaseUrl(target: OpsTarget): string {
  const port = target.port ? `:${target.port}` : ""
  return `${target.protocol}://${target.host}${port}`
}

function basicAuth(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`).toString("base64")
}

export async function fetchTargetJson<T>(
  target: OpsTarget,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const password = decryptSecret(target.passwordEnc)
  const response = await fetch(`${targetBaseUrl(target)}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${basicAuth(target.username, password)}`,
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(Number(process.env.OPS_COLLECTOR_TIMEOUT_MS || 15000)),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText)
    throw new Error(`RabbitMQ ${response.status}: ${body.slice(0, 300)}`)
  }

  return (await response.json()) as T
}

export async function rabbitmqRequestWithCredentials(
  target: OpsTarget,
  credentials: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(`${targetBaseUrl(target)}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  })

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  return { ok: response.ok, status: response.status, data }
}

export async function collectTarget(target: OpsTarget): Promise<{
  samples: OpsSampleInput[]
  error: string | null
}> {
  const startedAt = Date.now()
  const ts = startedAt
  const targetName = target.name
  const samples: OpsSampleInput[] = []

  try {
    const overview = await fetchTargetJson<OverviewResponse>(target, "/api/overview")
    const [nodes, queues, exchanges] = await Promise.all([
      fetchTargetJson<NodeResponse[]>(target, "/api/nodes").catch(() => []),
      fetchTargetJson<QueueResponse[]>(
        target,
        "/api/queues?columns=name,vhost,state,consumers,consumer_utilisation,messages,messages_ready,messages_unacknowledged,memory,message_stats",
      ).catch(() => []),
      fetchTargetJson<ExchangeResponse[]>(
        target,
        "/api/exchanges?columns=name,vhost,message_stats",
      ).catch(() => []),
    ])

    const responseMs = Date.now() - startedAt
    const push = (objectType: string, objectName: string, metric: string, value: number | undefined | null) => {
      samples.push({
        targetId: target.id,
        objectType,
        objectName,
        metric,
        value: Number(value ?? 0),
        ts,
      })
    }

    push("global", targetName, "service.reachable", 1)
    push("global", targetName, "service.response_ms", responseMs)

    const node = nodes.find((entry) => entry.name === overview.node) ?? nodes[0]
    if (node) {
      push("global", targetName, "node.mem_alarm", node.mem_alarm ? 1 : 0)
      push("global", targetName, "node.disk_alarm", node.disk_free_alarm ? 1 : 0)
      push("global", targetName, "node.mem_used", node.mem_used)
      push("global", targetName, "node.disk_free", node.disk_free)
      push(
        "global",
        targetName,
        "node.fd_used_ratio",
        node.fd_total ? ((node.fd_used ?? 0) / node.fd_total) * 100 : 0,
      )
      push(
        "global",
        targetName,
        "node.sockets_used_ratio",
        node.sockets_total ? ((node.sockets_used ?? 0) / node.sockets_total) * 100 : 0,
      )
      push("global", targetName, "node.uptime", node.uptime)
    }

    push("global", targetName, "overview.connections", overview.object_totals?.connections)
    push("global", targetName, "overview.channels", overview.object_totals?.channels)
    push("global", targetName, "overview.consumers", overview.object_totals?.consumers)
    push("global", targetName, "overview.queues", overview.object_totals?.queues)
    push("global", targetName, "overview.exchanges", overview.object_totals?.exchanges)
    push("global", targetName, "message.publish_rate", overview.message_stats?.publish_details?.rate)
    push("global", targetName, "message.deliver_rate", overview.message_stats?.deliver_get_details?.rate)
    push("global", targetName, "message.redelivered_rate", overview.message_stats?.redeliver_details?.rate)
    push("global", targetName, "message.unroutable_rate", overview.message_stats?.return_unroutable_details?.rate)

    for (const queue of queues) {
      if (target.vhost && queue.vhost !== target.vhost) continue
      const name = queue.vhost === "/" ? queue.name : `${queue.vhost}/${queue.name}`
      push("queue", name, "queue.messages", queue.messages)
      push("queue", name, "queue.messages_ready", queue.messages_ready)
      push(
        "queue",
        name,
        "queue.messages_without_consumers",
        (queue.consumers ?? 0) === 0 ? (queue.messages ?? 0) : 0,
      )
      push("queue", name, "queue.messages_unacked", queue.messages_unacknowledged)
      push("queue", name, "queue.consumers", queue.consumers)
      push("queue", name, "queue.consumer_utilisation", queue.consumer_utilisation ?? 0)
      push("queue", name, "queue.publish_rate", queue.message_stats?.publish_details?.rate)
      push("queue", name, "queue.deliver_rate", queue.message_stats?.deliver_get_details?.rate)
      push("queue", name, "queue.memory", queue.memory)
      push("queue", name, "queue.state", queue.state === "running" ? 1 : 0)
    }

    for (const exchange of exchanges) {
      if (target.vhost && exchange.vhost !== target.vhost) continue
      const name = exchange.vhost === "/" ? exchange.name : `${exchange.vhost}/${exchange.name}`
      push("exchange", name, "exchange.publish_in_rate", exchange.message_stats?.publish_in_details?.rate)
      push("exchange", name, "exchange.publish_out_rate", exchange.message_stats?.publish_out_details?.rate)
    }

    return { samples, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    samples.push({
      targetId: target.id,
      objectType: "global",
      objectName: targetName,
      metric: "service.reachable",
      value: 0,
      ts,
    })
    samples.push({
      targetId: target.id,
      objectType: "global",
      objectName: targetName,
      metric: "service.response_ms",
      value: Date.now() - startedAt,
      ts,
    })
    return { samples, error: message }
  }
}
