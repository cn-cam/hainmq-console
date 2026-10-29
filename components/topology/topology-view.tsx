"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Network, Search } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorCard } from "@/components/shared/error-card"
import { Skeleton } from "@/components/ui/skeleton"
import { usePolling } from "@/hooks/use-polling"
import { usePreferences } from "@/lib/stores/preferences"
import { useT } from "@/lib/i18n/client"
import type { Binding, Exchange, Queue } from "@/lib/rabbitmq/types"

interface Node {
  id: string
  kind: "exchange" | "queue"
  name: string
  vhost: string
  type?: string
  messages?: number
}

const WIDTH = 1000
const LEFT_X = 150
const RIGHT_X = 850
const NODE_W = 150
const ROW_H = 46

export function TopologyView() {
  const t = useT()
  const router = useRouter()
  const vhostPref = usePreferences((s) => s.vhost)
  const { data: exchanges, error: exchangeError, loading: exchangeLoading } =
    usePolling<Exchange[]>("/api/rabbitmq/exchanges")
  const { data: queues, error: queueError, loading: queueLoading } =
    usePolling<Queue[]>("/api/rabbitmq/queues")
  const { data: bindings, error: bindingError, loading: bindingLoading } =
    usePolling<Binding[]>("/api/rabbitmq/bindings")
  const [search, setSearch] = React.useState("")

  const error = exchangeError || queueError || bindingError
  const loading = exchangeLoading || queueLoading || bindingLoading

  const nodes = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    const all: Node[] = [
      ...(exchanges ?? []).map((exchange) => ({
        id: `e:${exchange.vhost}:${exchange.name}`,
        kind: "exchange" as const,
        name: exchange.name || t("common.defaultExchange"),
        vhost: exchange.vhost,
        type: exchange.type,
      })),
      ...(queues ?? []).map((queue) => ({
        id: `q:${queue.vhost}:${queue.name}`,
        kind: "queue" as const,
        name: queue.name,
        vhost: queue.vhost,
        messages: queue.messages,
      })),
    ]
    return all.filter((node) => {
      if (vhostPref && node.vhost !== vhostPref) return false
      if (!query) return true
      return node.name.toLowerCase().includes(query) || node.vhost.toLowerCase().includes(query)
    })
  }, [exchanges, queues, vhostPref, search, t])

  const edges = React.useMemo(() => {
    const visible = new Set(nodes.map((node) => node.id))
    return (bindings ?? [])
      .filter((binding) => !vhostPref || binding.vhost === vhostPref)
      .map((binding) => {
        const source = `e:${binding.vhost}:${binding.source}`
        const target =
          binding.destination_type === "queue"
            ? `q:${binding.vhost}:${binding.destination}`
            : `e:${binding.vhost}:${binding.destination}`
        return {
          id: `${binding.vhost}|${binding.source}|${binding.destination}|${binding.properties_key}`,
          source,
          target,
          routingKey: binding.routing_key,
        }
      })
      .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
  }, [bindings, nodes, vhostPref])

  const exchangeNodes = nodes.filter((node) => node.kind === "exchange")
  const queueNodes = nodes.filter((node) => node.kind === "queue")
  const height = Math.max(520, Math.max(exchangeNodes.length, queueNodes.length) * ROW_H + 120)
  const positions = new Map<string, { x: number; y: number }>()
  exchangeNodes.forEach((node, index) => {
    positions.set(node.id, { x: LEFT_X, y: 70 + index * ROW_H })
  })
  queueNodes.forEach((node, index) => {
    positions.set(node.id, { x: RIGHT_X, y: 70 + index * ROW_H })
  })

  if (error && !exchanges && !queues) {
    return <ErrorCard message={error} type="CONNECTION" />
  }
  if (loading && !exchanges && !queues) {
    return <Skeleton className="h-[520px] w-full rounded-lg" />
  }

  return (
    <div className="space-y-4">
      <PageHeader titleKey="page.topology.title" descriptionKey="page.topology.description" />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("topology.searchPlaceholder")}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="secondary">{t("topology.exchanges", { count: exchangeNodes.length })}</Badge>
          <Badge variant="secondary">{t("topology.queues", { count: queueNodes.length })}</Badge>
          <Badge variant="secondary">{t("topology.bindings", { count: edges.length })}</Badge>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {!nodes.length ? (
            <div className="flex h-[420px] flex-col items-center justify-center gap-2 text-muted-foreground">
              <Network className="h-8 w-8 opacity-40" />
              <p className="text-xs">{t("topology.empty")}</p>
            </div>
          ) : (
            <div className="overflow-auto">
              <svg
                viewBox={`0 0 ${WIDTH} ${height}`}
                className="min-w-[900px]"
                style={{ height }}
                role="img"
                aria-label={t("page.topology.title")}
              >
                <defs>
                  <marker id="topology-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                  </marker>
                </defs>
                {edges.map((edge) => {
                  const source = positions.get(edge.source)
                  const target = positions.get(edge.target)
                  if (!source || !target) return null
                  const sourceX = source.x + NODE_W
                  const targetX = target.x
                  const mid = (sourceX + targetX) / 2
                  return (
                    <path
                      key={edge.id}
                      d={`M ${sourceX} ${source.y + 16} C ${mid} ${source.y + 16}, ${mid} ${target.y + 16}, ${targetX} ${target.y + 16}`}
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity="0.28"
                      strokeWidth="1.2"
                      markerEnd="url(#topology-arrow)"
                      className="text-muted-foreground"
                    >
                      <title>{edge.routingKey || "—"}</title>
                    </path>
                  )
                })}

                <text x={LEFT_X + NODE_W / 2} y="38" textAnchor="middle" className="fill-muted-foreground text-[11px] font-medium">
                  {t("topology.exchangeColumn")}
                </text>
                <text x={RIGHT_X + NODE_W / 2} y="38" textAnchor="middle" className="fill-muted-foreground text-[11px] font-medium">
                  {t("topology.queueColumn")}
                </text>

                {nodes.map((node) => {
                  const position = positions.get(node.id)
                  if (!position) return null
                  const isExchange = node.kind === "exchange"
                  return (
                    <g
                      key={node.id}
                      transform={`translate(${position.x}, ${position.y})`}
                      className="cursor-pointer"
                      onClick={() => {
                        if (node.kind === "queue") {
                          router.push(`/queues?q=${encodeURIComponent(node.name)}`)
                        } else {
                          router.push("/exchanges")
                        }
                      }}
                    >
                      <rect
                        width={NODE_W}
                        height="32"
                        rx="8"
                        className={isExchange ? "fill-primary/10 stroke-primary/40" : "fill-card stroke-border"}
                        strokeWidth="1"
                      />
                      <text x="10" y="20" className="fill-foreground text-[11px] font-medium">
                        {node.name.length > 22 ? `${node.name.slice(0, 21)}…` : node.name}
                      </text>
                      {isExchange && node.type && (
                        <text x={NODE_W - 10} y="20" textAnchor="end" className="fill-muted-foreground text-[9px]">
                          {node.type}
                        </text>
                      )}
                      {!isExchange && node.messages !== undefined && (
                        <text x={NODE_W - 10} y="20" textAnchor="end" className="fill-muted-foreground text-[9px]">
                          {node.messages}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
