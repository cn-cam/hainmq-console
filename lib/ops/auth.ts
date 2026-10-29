import { timingSafeEqual } from "node:crypto"
import { getSessionFromCookie } from "@/lib/auth/session"
import type { AuthSession } from "@/lib/rabbitmq/types"
import { getLocalRole } from "./store"
import type { OpsRole, OpsUser } from "./types"

export class OpsHttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "OpsHttpError"
    this.status = status
  }
}

const ROLE_WEIGHT: Record<OpsRole, number> = {
  viewer: 1,
  operator: 2,
  admin: 3,
}

function adminAllowlist(): string[] {
  const raw = process.env.OPS_ADMIN_USERS
  if (raw === undefined) return ["administrator"]
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
}

export async function getOpsUser(): Promise<(OpsUser & { session: AuthSession }) | null> {
  const session = await getSessionFromCookie()
  if (!session) return null

  const localRole = getLocalRole(session.user.username)
  if (localRole) {
    return {
      role: localRole.role,
      username: session.user.username,
      isAdmin: localRole.role === "admin",
      session,
    }
  }

  const tags = session.user.tags.map((tag) => tag.toLowerCase())
  let role: OpsRole | null = null

  if (session.user.isAdmin || tags.includes("administrator")) {
    const allowlist = adminAllowlist()
    role = allowlist.length === 0 || allowlist.includes(session.user.username) ? "admin" : "operator"
  } else if (tags.includes("policymaker") || tags.includes("management")) {
    role = "operator"
  } else if (tags.includes("monitoring")) {
    role = "viewer"
  }

  if (!role) return null

  return {
    role,
    username: session.user.username,
    isAdmin: role === "admin",
    session,
  }
}

export async function requireOpsUser(minRole: OpsRole = "viewer") {
  const user = await getOpsUser()
  if (!user) throw new OpsHttpError(403, "Operations access denied")
  if (ROLE_WEIGHT[user.role] < ROLE_WEIGHT[minRole]) {
    throw new OpsHttpError(403, "Insufficient operations permissions")
  }
  return user
}

export function verifyMcpToken(request: Request): boolean {
  const expected = process.env.OPS_MCP_TOKEN
  if (!expected) return false

  const header = request.headers.get("authorization") || ""
  const provided = header.startsWith("Bearer ") ? header.slice(7) : ""
  if (!provided) return false

  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin")
  if (!origin) return

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw new OpsHttpError(403, "Invalid origin")
  }

  const requestHost = request.headers.get("host")
  if (!requestHost || originHost !== requestHost) {
    throw new OpsHttpError(403, "Cross-origin request rejected")
  }
}

export function requireWriteRole(user: OpsUser): void {
  if (ROLE_WEIGHT[user.role] < ROLE_WEIGHT.operator) {
    throw new OpsHttpError(403, "Write operations require operator or admin role")
  }
}
