"use client"

export class OpsApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "OpsApiError"
    this.status = status
  }
}

export async function opsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/ops${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
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
    const error =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${response.status})`
    throw new OpsApiError(response.status, error)
  }

  return data as T
}

export function opsPost<T>(path: string, body: unknown): Promise<T> {
  return opsFetch<T>(path, { method: "POST", body: JSON.stringify(body) })
}

export function opsPut<T>(path: string, body: unknown): Promise<T> {
  return opsFetch<T>(path, { method: "PUT", body: JSON.stringify(body) })
}

export function formatOpsTime(value: number | null | undefined): string {
  if (!value) return "—"
  try {
    return new Date(value).toLocaleString()
  } catch {
    return "—"
  }
}

export function formatCompactNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—"
  return value.toLocaleString()
}

export function formatRate(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—"
  return `${value.toFixed(2)}/s`
}

export function formatBytes(value: number | undefined | null): string {
  if (!value) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toFixed(1)} ${units[index]}`
}

export function severityClass(severity: string): string {
  if (severity === "critical") return "text-destructive"
  if (severity === "warning") return "text-warning"
  return "text-muted-foreground"
}

export function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" {
  if (status === "firing" || status === "failed") return "destructive"
  if (status === "pending") return "warning"
  if (status === "resolved" || status === "executed" || status === "sent") return "success"
  if (status === "rejected" || status === "expired") return "secondary"
  return "outline"
}
