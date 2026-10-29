import { RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_PROTOCOL } from "./config"
import type { ClusterSummary } from "./types"

export interface ClusterConfig extends ClusterSummary {
  host: string
  port: string
  protocol: "http" | "https"
}

function normalizeProtocol(value: unknown): "http" | "https" {
  return value === "https" ? "https" : "http"
}

function normalizePort(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string") return value.trim()
  return ""
}

function defaultCluster(): ClusterConfig {
  return {
    id: "default",
    name: process.env.RABBITMQ_CLUSTER_NAME?.trim() || RABBITMQ_HOST,
    host: RABBITMQ_HOST,
    port: RABBITMQ_PORT,
    protocol: normalizeProtocol(RABBITMQ_PROTOCOL),
  }
}

function parseClusters(raw: string | undefined): ClusterConfig[] {
  if (!raw?.trim()) return [defaultCluster()]

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [defaultCluster()]

    const seen = new Set<string>()
    const clusters: ClusterConfig[] = []

    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue
      const value = entry as Record<string, unknown>
      const id = typeof value.id === "string" ? value.id.trim() : ""
      const host = typeof value.host === "string" ? value.host.trim() : ""
      if (!id || !host || seen.has(id)) continue

      seen.add(id)
      const name =
        typeof value.name === "string" && value.name.trim() ? value.name.trim() : id
      clusters.push({
        id,
        name,
        host,
        port: normalizePort(value.port) || "15672",
        protocol: normalizeProtocol(value.protocol),
      })
    }

    return clusters.length ? clusters : [defaultCluster()]
  } catch {
    return [defaultCluster()]
  }
}

export function listClusters(): ClusterConfig[] {
  return parseClusters(process.env.RABBITMQ_CLUSTERS)
}

export function getDefaultCluster(): ClusterConfig {
  return listClusters()[0]
}

export function getCluster(id?: string | null): ClusterConfig | null {
  const clusters = listClusters()
  if (!id) return clusters[0] ?? null
  return clusters.find((cluster) => cluster.id === id) ?? null
}

export function getClusterBaseUrl(cluster: ClusterConfig): string {
  const portPart = cluster.port ? `:${cluster.port}` : ""
  return `${cluster.protocol}://${cluster.host}${portPart}`
}

export function toClusterSummary(cluster: ClusterConfig): ClusterSummary {
  return { id: cluster.id, name: cluster.name }
}
