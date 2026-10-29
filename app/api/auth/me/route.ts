import { NextResponse } from 'next/server'
import { getSessionFromCookie } from '@/lib/auth/session'
import { getCluster, toClusterSummary } from '@/lib/rabbitmq/clusters'

export const dynamic = 'force-dynamic'

/**
 * Returns the current user from the session cookie so the client store
 * survives full page reloads without re-authenticating.
 */
export async function GET() {
  const session = await getSessionFromCookie()
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  const cluster = getCluster(session.clusterId)
  if (!cluster) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  return NextResponse.json({
    authenticated: true,
    user: session.user,
    cluster: toClusterSummary(cluster),
  })
}
