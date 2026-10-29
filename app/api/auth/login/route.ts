import { NextResponse } from 'next/server'
import { validateCredentials } from '@/lib/rabbitmq/client'
import { getCluster, toClusterSummary } from '@/lib/rabbitmq/clusters'
import { COOKIE_NAME, createSession, normalizeTags, sessionCookieOptions } from '@/lib/auth/session'
import { classifyError } from '@/lib/rabbitmq/errors'
import type { RabbitMQUser } from '@/lib/rabbitmq/types'

export async function POST(request: Request) {
  try {
    const { username, password, clusterId } = await request.json()

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 },
      )
    }

    const cluster = getCluster(typeof clusterId === 'string' ? clusterId : undefined)
    if (!cluster) {
      return NextResponse.json({ error: 'Unknown cluster' }, { status: 400 })
    }

    const whoami = await validateCredentials(username, password, cluster.id)
    const tags = normalizeTags(whoami.tags)

    const user: RabbitMQUser = {
      username: whoami.name,
      isAdmin: tags.includes('administrator'),
      tags,
    }

    const credentials = Buffer.from(`${username}:${password}`).toString('base64')

    // Attach the cookie to the response directly. The Secure attribute is
    // derived from the actual request protocol (see isSecureRequest), so
    // plain-HTTP deployments keep working sessions.
    const response = NextResponse.json({
      authenticated: true,
      user,
      cluster: toClusterSummary(cluster),
    })
    response.cookies.set(
      COOKIE_NAME,
      JSON.stringify(createSession(credentials, user, cluster.id)),
      sessionCookieOptions(request),
    )
    return response
  } catch (err) {
    const error = classifyError(err)
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
}
