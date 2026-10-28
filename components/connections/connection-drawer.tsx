"use client"

import * as React from "react"
import { XCircle } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { connectionDisplayName } from "./connection-table"
import { useT } from "@/lib/i18n/client"
import { formatBytes, formatRate, formatUptime } from "@/lib/utils"
import type { Connection } from "@/lib/rabbitmq/types"

interface ConnectionDrawerProps {
  connection: Connection | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onCloseConnection: (c: Connection) => void
}

export function ConnectionDrawer(props: ConnectionDrawerProps) {
  if (!props.connection) return null
  return <ConnectionDrawerInner {...props} connection={props.connection} />
}

function ConnectionDrawerInner({
  connection: c,
  open,
  onOpenChange,
  onCloseConnection,
}: ConnectionDrawerProps & { connection: Connection }) {
  const t = useT()
  // Captured once at mount; the drawer is short-lived so drift is negligible
  const [openedAt] = React.useState(() => Date.now())
  const displayName = connectionDisplayName(c)
  const props = c.client_properties ?? {}
  const connectedFor = c.connected_at ? openedAt - c.connected_at : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="truncate pr-8 font-mono text-sm">
            {displayName ?? c.name}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">{c.name}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-5">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={c.state === "running" ? "success" : "warning"}>{c.state}</Badge>
            <Badge variant="secondary">{c.protocol}</Badge>
            {c.ssl && <Badge variant="success">TLS {c.ssl_protocol}</Badge>}
            <Badge variant="secondary">{c.auth_mechanism}</Badge>
          </div>

          {/* Throughput */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-card px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                {t("connectionDrawer.received")}
              </p>
              <p className="mt-0.5 font-mono text-lg font-semibold tracking-tight tnum">
                {formatBytes(c.recv_oct)}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground tnum">
                {formatRate(c.recv_oct_details?.rate ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2.5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">{t("connectionDrawer.sent")}</p>
              <p className="mt-0.5 font-mono text-lg font-semibold tracking-tight tnum">
                {formatBytes(c.send_oct)}
              </p>
              <p className="font-mono text-[11px] text-muted-foreground tnum">
                {formatRate(c.send_oct_details?.rate ?? 0)}
              </p>
            </div>
          </div>

          <Separator />

          <div className="space-y-2 text-xs">
            <Row label={t("connectionDrawer.user")} value={c.user} />
            <Row label={t("connectionDrawer.vhost")} value={c.vhost} />
            <Row label={t("connectionDrawer.peer")} value={`${c.peer_host}:${c.peer_port}`} />
            <Row label={t("connectionDrawer.channels")} value={`${c.channels} / ${c.channel_max || "∞"}`} />
            {connectedFor != null && connectedFor > 0 && (
              <Row label={t("connectionDrawer.connectedFor")} value={formatUptime(connectedFor)} />
            )}
            <Row label={t("connectionDrawer.frameMax")} value={formatBytes(c.frame_max)} />
            <Row label={t("connectionDrawer.heartbeat")} value={c.timeout ? `${c.timeout}s` : "—"} />
          </div>

          {/* Client properties */}
          <Separator />
          <div>
            <h4 className="mb-2 text-xs font-medium text-muted-foreground">{t("connectionDrawer.client")}</h4>
            <div className="space-y-2 text-xs">
              {props.connection_name && <Row label={t("connectionDrawer.name")} value={props.connection_name} />}
              {props.product && <Row label={t("connectionDrawer.product")} value={props.product} />}
              {props.version && <Row label={t("connectionDrawer.version")} value={props.version} />}
              {props.platform && <Row label={t("connectionDrawer.platform")} value={props.platform} />}
            </div>
          </div>

          <Separator />

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:text-destructive"
            onClick={() => onCloseConnection(c)}
          >
            <XCircle className="h-3.5 w-3.5" /> {t("connectionDrawer.close")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-muted-foreground/70">{label}</span>
      <span className="truncate font-mono tnum">{value}</span>
    </div>
  )
}
