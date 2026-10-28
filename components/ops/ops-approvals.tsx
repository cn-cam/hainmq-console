"use client"

import * as React from "react"
import { Check, RefreshCw, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useI18n } from "@/lib/i18n/client"
import { opsText } from "@/lib/ops/ui-text"
import { formatOpsTime, opsFetch, opsPost, statusVariant } from "@/lib/ops/ui"
import type { OpsApproval } from "@/lib/ops/types"
import type { OpsMe } from "./types"

export function OpsApprovals() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [approvals, setApprovals] = React.useState<OpsApproval[]>([])
  const [me, setMe] = React.useState<OpsMe | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<OpsApproval | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const [list, currentUser] = await Promise.all([
        opsFetch<OpsApproval[]>("/approvals"),
        opsFetch<OpsMe>("/me"),
      ])
      setApprovals(list)
      setMe(currentUser)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.loadFailed"))
    }
  }, [tr])

  React.useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0)
    const timer = setInterval(() => void load(), 15000)
    return () => {
      clearTimeout(kickoff)
      clearInterval(timer)
    }
  }, [load])

  const decide = async (approval: OpsApproval, action: "approve" | "reject") => {
    setBusy(true)
    try {
      await opsPost(`/approvals/${approval.id}`, { action })
      setMessage(action === "approve" ? tr("approvals.executed") : tr("approvals.rejected"))
      setSelected(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.approveFailed"))
    } finally {
      setBusy(false)
    }
  }

  const statusLabel = (status: string) => {
    if (status === "pending") return tr("approvals.pending")
    if (status === "executed") return tr("approvals.executed")
    if (status === "failed") return tr("approvals.failed")
    if (status === "rejected") return tr("approvals.rejected")
    if (status === "expired") return tr("approvals.expired")
    return status
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs text-success">
          {message}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> {tr("common.refresh")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("approvals.action")}</TableHead>
              <TableHead>{tr("common.target")}</TableHead>
              <TableHead>{tr("approvals.requestedBy")}</TableHead>
              <TableHead>{tr("approvals.requestedAt")}</TableHead>
              <TableHead>{tr("common.status")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!approvals.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-xs text-muted-foreground">
                  {tr("approvals.empty")}
                </TableCell>
              </TableRow>
            ) : (
              approvals.map((approval) => (
                <TableRow key={approval.id}>
                  <TableCell className="font-mono text-xs">{approval.action}</TableCell>
                  <TableCell className="text-xs">{approval.targetId}</TableCell>
                  <TableCell className="text-xs">{approval.requestedBy}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatOpsTime(approval.requestedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(approval.status)}>
                      {statusLabel(approval.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => setSelected(approval)}
                    >
                      {tr("common.details")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{tr("approvals.approveTitle")}</DialogTitle>
            <DialogDescription>{tr("approvals.approveHint")}</DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <Info label={tr("approvals.action")} value={selected.action} />
                <Info label={tr("common.target")} value={String(selected.targetId)} />
                <Info label={tr("approvals.requestedBy")} value={selected.requestedBy} />
                <Info label={tr("common.status")} value={statusLabel(selected.status)} />
              </div>
              <div>
                <p className="mb-1 text-muted-foreground">{tr("approvals.payload")}</p>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-[11px]">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
              {selected.result && (
                <div>
                  <p className="mb-1 text-muted-foreground">{tr("approvals.result")}</p>
                  <pre className="max-h-40 overflow-auto rounded-md bg-muted/50 p-3 font-mono text-[11px]">
                    {selected.result}
                  </pre>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              {tr("common.cancel")}
            </Button>
            {selected?.status === "pending" && me?.role !== "viewer" && (
              <>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => selected && void decide(selected, "reject")}
                >
                  <X className="mr-1 h-3.5 w-3.5" /> {tr("approvals.reject")}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => selected && void decide(selected, "approve")}
                >
                  <Check className="mr-1 h-3.5 w-3.5" /> {tr("approvals.approve")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">{label}</p>
      <p className="mt-0.5 font-mono text-xs">{value}</p>
    </div>
  )
}
