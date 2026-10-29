export class AdminApiError extends Error {
  status: number
  details?: string

  constructor(status: number, message: string, details?: string) {
    super(message)
    this.name = "AdminApiError"
    this.status = status
    this.details = details
  }
}

function errorMessage(data: unknown, status: number): { message: string; details?: string } {
  if (data && typeof data === "object") {
    const body = data as { error?: unknown; details?: unknown }
    const details = typeof body.details === "string" ? body.details : undefined
    const message = typeof body.error === "string" ? body.error : `Request failed (${status})`
    return { message, details }
  }
  return { message: `Request failed (${status})` }
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/rabbitmq${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
    cache: "no-store",
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

  if (!response.ok) {
    const { message, details } = errorMessage(data, response.status)
    throw new AdminApiError(response.status, message, details)
  }

  return data as T
}

export function adminPut<T>(path: string, body: unknown): Promise<T> {
  return adminFetch<T>(path, { method: "PUT", body: JSON.stringify(body) })
}

export function adminPost<T>(path: string, body: unknown): Promise<T> {
  return adminFetch<T>(path, { method: "POST", body: JSON.stringify(body) })
}

export function adminDelete<T = unknown>(path: string): Promise<T> {
  return adminFetch<T>(path, { method: "DELETE" })
}

export function encode(value: string): string {
  return encodeURIComponent(value)
}
