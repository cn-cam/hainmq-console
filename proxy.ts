import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/clusters',
  '/api/health',
  '/api/metrics',
  '/api/ops/mcp',
]

const LOGIN_WINDOW_MS = 60_000
const LOGIN_LIMIT = 20
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function secure(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return response
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

function loginRateLimited(request: NextRequest): boolean {
  const ip = clientIp(request)
  const current = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || entry.resetAt <= current) {
    loginAttempts.set(ip, { count: 1, resetAt: current + LOGIN_WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > LOGIN_LIMIT
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const method = request.method.toUpperCase()
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const hasSession = request.cookies.has('rmq-session')

  if (pathname === '/api/auth/login' && method === 'POST' && loginRateLimited(request)) {
    return secure(
      NextResponse.json(
        { error: 'Too many login attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      ),
    )
  }

  if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const origin = request.headers.get('origin')
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.get('host')) {
          return secure(NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 }))
        }
      } catch {
        return secure(NextResponse.json({ error: 'Invalid origin' }, { status: 403 }))
      }
    }
  }

  if (isPublic) {
    // Redirect authenticated users away from login
    if (pathname === '/login' && hasSession) {
      return secure(NextResponse.redirect(new URL('/', request.url)))
    }
    return secure(NextResponse.next())
  }

  if (!hasSession) {
    // API calls get a proper 401 instead of a redirect-to-HTML,
    // so client fetches can detect session expiry cleanly.
    if (pathname.startsWith('/api/')) {
      return secure(NextResponse.json({ error: 'Not authenticated' }, { status: 401 }))
    }

    const loginUrl = new URL('/login', request.url)
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname)
    return secure(NextResponse.redirect(loginUrl))
  }

  return secure(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images/).*)'],
}
