import { NextResponse } from "next/server"
import {
  COOKIE_NAME,
  createSession,
  decodeBasicCredentials,
  getSessionFromCookie,
  normalizeTags,
  sessionCookieOptions,
} from "@/lib/auth/session"
import { getCluster, toClusterSummary } from "@/lib/rabbitmq/clusters"
import { validateCredentials } from "@/lib/rabbitmq/client"
import { classifyError } from "@/lib/rabbitmq/errors"
import type { RabbitMQUser } from "@/lib/rabbitmq/types"

export async function POST(request: Request) {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  }

  let clusterId: string | undefined
  try {
    const body = (await request.json()) as { clusterId?: unknown }
    clusterId = typeof body.clusterId === "string" ? body.clusterId : undefined
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const cluster = getCluster(clusterId)
  if (!cluster) {
    return NextResponse.json({ error: "Unknown cluster" }, { status: 400 })
  }

  const decoded = decodeBasicCredentials(session.credentials)
  if (!decoded) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 })
  }

  try {
    const whoami = await validateCredentials(decoded.username, decoded.password, cluster.id)
    const tags = normalizeTags(whoami.tags)
    const user: RabbitMQUser = {
      username: whoami.name,
      isAdmin: tags.includes("administrator"),
      tags,
    }

    const response = NextResponse.json({
      authenticated: true,
      user,
      cluster: toClusterSummary(cluster),
    })
    response.cookies.set(
      COOKIE_NAME,
      JSON.stringify(createSession(session.credentials, user, cluster.id)),
      sessionCookieOptions(request),
    )
    return response
  } catch (err) {
    const error = classifyError(err)
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
}
