"use client"

import * as React from "react"
import { Loader2, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

export function AdminToolbar({
  title,
  description,
  onRefresh,
  onNew,
  busy,
  refreshLabel,
  newLabel,
}: {
  title: string
  description: string
  onRefresh: () => void
  onNew?: () => void
  busy?: boolean
  refreshLabel: string
  newLabel?: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onRefresh} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {refreshLabel}
        </Button>
        {onNew && (
          <Button size="sm" className="h-8 gap-1.5" onClick={onNew} disabled={busy}>
            <Plus className="h-3.5 w-3.5" />
            {newLabel}
          </Button>
        )}
      </div>
    </div>
  )
}

export function AdminError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      {message}
    </div>
  )
}

export function AdminEmpty({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-xs text-muted-foreground">
        {message}
      </td>
    </tr>
  )
}

export function JsonTextarea({
  id,
  label,
  value,
  onChange,
  rows = 8,
  hint,
  className,
}: {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  hint?: string
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        spellCheck={false}
        className="w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function splitTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
}

export function formatTags(tags: string[] | string | undefined): string {
  if (Array.isArray(tags)) return tags.join(", ")
  return tags || ""
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
