import { NextRequest, NextResponse } from "next/server"
import { getSessionFromCookie } from "@/lib/auth/session"
import { RABBITMQ_API_TIMEOUT_MS } from "@/lib/rabbitmq/config"
import { getCluster, getClusterBaseUrl } from "@/lib/rabbitmq/clusters"
import type { QueueMessage } from "@/lib/rabbitmq/types"

export const dynamic = "force-dynamic"

type MoveBody = {
  vhost?: string
  sourceQueue?: string
  targetType?: "queue" | "exchange"
  target?: string
  routingKey?: string
  count?: number
}

function enc(value: string): string {
  return encodeURIComponent(value)
}

function headers(credentials: string): Record<string, string> {
  return {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
  }
}

async function getMessages(
  baseUrl: string,
  credentials: string,
  vhost: string,
  queue: string,
  count: number,
): Promise<QueueMessage[]> {
  const response = await fetch(
    `${baseUrl}/api/queues/${enc(vhost)}/${enc(queue)}/get`,
    {
      method: "POST",
      headers: headers(credentials),
      body: JSON.stringify({ count, ackmode: "ack_requeue_false", encoding: "auto" }),
      cache: "no-store",
      signal: AbortSignal.timeout(RABBITMQ_API_TIMEOUT_MS),
    },
  )

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText)
    throw new Error(`RabbitMQ get failed (${response.status}): ${text.slice(0, 500)}`)
  }

  const data = (await response.json()) as unknown
  return Array.isArray(data) ? (data as QueueMessage[]) : []
}

async function publish(
  baseUrl: string,
  credentials: string,
  vhost: string,
  exchange: string,
  routingKey: string,
  message: QueueMessage,
): Promise<boolean> {
  const response = await fetch(
    `${baseUrl}/api/exchanges/${enc(vhost)}/${enc(exchange || "amq.default")}/publish`,
    {
      method: "POST",
      headers: headers(credentials),
      body: JSON.stringify({
        routing_key: routingKey,
        payload: message.payload,
        payload_encoding: message.payload_encoding || "string",
        properties: message.properties || {},
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(RABBITMQ_API_TIMEOUT_MS),
    },
  )

  if (!response.ok) return false
  const data = (await response.json().catch(() => null)) as { routed?: boolean } | null
  return data?.routed !== false
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  const cluster = getCluster(session.clusterId)
  if (!cluster) {
    return NextResponse.json({ error: "Cluster not configured" }, { status: 401 })
  }

  let body: MoveBody
  try {
    body = (await request.json()) as MoveBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const vhost = String(body.vhost || "/")
  const sourceQueue = String(body.sourceQueue || "").trim()
  const targetType = body.targetType === "exchange" ? "exchange" : "queue"
  const target = String(body.target || "").trim()
  const routingKey = String(body.routingKey || "").trim()
  const count = Math.max(1, Math.min(500, Number(body.count) || 10))

  if (!sourceQueue || !target) {
    return NextResponse.json(
      { error: "sourceQueue and target are required" },
      { status: 400 },
    )
  }

  const baseUrl = getClusterBaseUrl(cluster)

  try {
    const messages = await getMessages(
      baseUrl,
      session.credentials,
      vhost,
      sourceQueue,
      count,
    )

    let moved = 0
    let requeued = 0
    let failed = 0
    const errors: string[] = []

    for (const message of messages) {
      const exchange = targetType === "queue" ? "amq.default" : target
      const key = targetType === "queue" ? target : routingKey || message.routing_key || ""
      const published = await publish(
        baseUrl,
        session.credentials,
        vhost,
        exchange,
        key,
        message,
      ).catch(() => false)

      if (published) {
        moved += 1
        continue
      }

      const restored = await publish(
        baseUrl,
        session.credentials,
        vhost,
        "amq.default",
        sourceQueue,
        message,
      ).catch(() => false)

      if (restored) {
        requeued += 1
        errors.push(`Message ${message.properties?.message_id || message.routing_key} was returned to the source queue`)
      } else {
        failed += 1
        errors.push(`Message ${message.properties?.message_id || message.routing_key} could not be moved or requeued`)
      }
    }

    return NextResponse.json({
      total: messages.length,
      moved,
      requeued,
      failed,
      errors: errors.slice(0, 20),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Move failed"
    const isTimeout = message.includes("timeout") || message.includes("aborted")
    return NextResponse.json(
      { error: isTimeout ? "Request timed out" : message },
      { status: isTimeout ? 408 : 502 },
    )
  }
}
