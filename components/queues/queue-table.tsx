"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Bookmark, Eraser, Layers, Plus, Search, Star, Trash2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DensityToggle,
  EmptyState,
  Pagination,
  SortButton,
  StaleDataBanner,
  usePagination,
  useRowPadding,
  useSort,
} from "@/components/shared/table-utils"
import { ErrorCard } from "@/components/shared/error-card"
import { QueueDrawer } from "./queue-drawer"
import { CreateQueueDialog } from "./create-queue-dialog"
import { BulkQueueDialog } from "./bulk-queue-dialog"
import { usePolling } from "@/hooks/use-polling"
import { usePreferences, type SavedQueueView } from "@/lib/stores/preferences"
import { useT } from "@/lib/i18n/client"
import { formatRate, cn } from "@/lib/utils"
import type { Queue } from "@/lib/rabbitmq/types"

type SortKey =
  | "name"
  | "messages"
  | "messages_ready"
  | "messages_unacknowledged"
  | "consumers"
  | "state"

const TYPE_BADGES: Record<string, "info" | "secondary" | "warning"> = {
  quorum: "info",
  stream: "warning",
  classic: "secondary",
}

export function QueueTable() {
  const t = useT()
  const vhost = usePreferences((s) => s.vhost)
  const setVhost = usePreferences((s) => s.setVhost)
  const favorites = usePreferences((s) => s.favorites)
  const toggleFavorite = usePreferences((s) => s.toggleFavorite)
  const savedViews = usePreferences((s) => s.savedQueueViews)
  const saveQueueView = usePreferences((s) => s.saveQueueView)
  const removeQueueView = usePreferences((s) => s.removeQueueView)
  const url = vhost
    ? `/api/rabbitmq/queues/${encodeURIComponent(vhost)}`
    : "/api/rabbitmq/queues"
  const { data: queues, error, loading, lastUpdated, refresh } = usePolling<Queue[]>(url)

  const searchParams = useSearchParams()
  const qParam = searchParams.get("q")
  const [search, setSearch] = React.useState(qParam ?? "")
  // Keep the filter in sync with ?q= deep links (command palette jumps) —
  // state adjusted during render per React's derive-from-props pattern
  const [prevQParam, setPrevQParam] = React.useState(qParam)
  if (qParam !== prevQParam) {
    setPrevQParam(qParam)
    if (qParam !== null) setSearch(qParam)
  }
  const [stateFilter, setStateFilter] = React.useState<string>("all")
  const [favoritesOnly, setFavoritesOnly] = React.useState(false)
  const { sortKey, sortDir, toggle, compare } = useSort<SortKey>("name")
  const rowPad = useRowPadding()

  const [selected, setSelected] = React.useState<Queue | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = React.useState<"purge" | "delete" | null>(null)

  const list = React.useMemo(() => (Array.isArray(queues) ? queues : []), [queues])

  const states = React.useMemo(
    () => Array.from(new Set(list.map((q) => q.state))).sort(),
    [list],
  )

  const filtered = React.useMemo(() => {
    let out = list
    if (stateFilter !== "all") out = out.filter((q) => q.state === stateFilter)
    if (favoritesOnly) out = out.filter((q) => favorites.includes(`${q.vhost}/${q.name}`))
    if (search) {
      const q = search.toLowerCase()
      out = out.filter(
        (queue) =>
          queue.name.toLowerCase().includes(q) || queue.vhost.toLowerCase().includes(q),
      )
    }
    return [...out].sort((a, b) => compare(a[sortKey], b[sortKey]))
  }, [list, search, stateFilter, favoritesOnly, favorites, sortKey, compare])

  const { page, setPage, pageCount, paged } = usePagination(filtered)

  const keyOf = (queue: Queue) => `${queue.vhost}/${queue.name}`
  const selectedQueues = list.filter((queue) => selectedKeys.has(keyOf(queue)))
  const allPagedSelected =
    paged.length > 0 && paged.every((queue) => selectedKeys.has(keyOf(queue)))

  const toggleQueue = (queue: Queue) => {
    const key = keyOf(queue)
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllPaged = () => {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (allPagedSelected) {
        for (const queue of paged) next.delete(keyOf(queue))
      } else {
        for (const queue of paged) next.add(keyOf(queue))
      }
      return next
    })
  }

  const applyView = (view: SavedQueueView) => {
    setSearch(view.search)
    setStateFilter(view.stateFilter)
    setVhost(view.vhost)
    setFavoritesOnly(false)
    setPage(1)
  }

  const saveCurrentView = () => {
    const name = window.prompt(t("queues.viewName"))
    if (!name?.trim()) return
    saveQueueView({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      search,
      stateFilter,
      vhost,
    })
  }

  if (error && !queues) return <ErrorCard message={error} type="CONNECTION" onRetry={refresh} />
  if (loading && !queues) return <QueueTableSkeleton />

  const queueType = (q: Queue) =>
    q.type ?? (q.arguments?.["x-queue-type"] as string | undefined) ?? "classic"

  return (
    <div className="space-y-3">
      {error && queues && <StaleDataBanner error={error} lastUpdated={lastUpdated} onRetry={refresh} />}
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("queues.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 border-transparent bg-secondary/50 pl-8 text-xs transition-all focus:border-border focus:bg-background"
          />
        </div>

        <Select value={stateFilter} onValueChange={setStateFilter}>
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder={t("queues.allStates")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("queues.allStates")}</SelectItem>
            {states.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      s === "running" ? "bg-success" : "bg-warning",
                    )}
                  />
                  {s}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant={favoritesOnly ? "secondary" : "outline"}
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => setFavoritesOnly((value) => !value)}
        >
          <Star className={cn("h-3.5 w-3.5", favoritesOnly && "fill-current")} />
          {t("queues.favoritesOnly")}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Bookmark className="h-3.5 w-3.5" />
              {t("queues.views")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuItem onClick={saveCurrentView}>
              <Plus className="h-3.5 w-3.5" /> {t("queues.saveView")}
            </DropdownMenuItem>
            {savedViews.length > 0 && <DropdownMenuSeparator />}
            {savedViews.map((view) => (
              <DropdownMenuItem key={view.id} onClick={() => applyView(view)}>
                <span className="truncate">{view.name}</span>
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  aria-label={t("queues.deleteView")}
                  onClick={(event) => {
                    event.stopPropagation()
                    removeQueueView(view.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {selectedKeys.size > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-muted-foreground">
              {t("queues.selected", { count: selectedKeys.size })}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-warning hover:text-warning"
              onClick={() => setBulkAction("purge")}
            >
              <Eraser className="h-3.5 w-3.5" /> {t("queues.bulkPurge")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-destructive hover:text-destructive"
              onClick={() => setBulkAction("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("queues.bulkDelete")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[11px]"
              onClick={() => setSelectedKeys(new Set())}
            >
              {t("queues.clearSelection")}
            </Button>
          </div>
        )}

        <span className="ml-auto text-[11px] text-muted-foreground tnum">
          {list.length === 1
            ? t("queues.countOne", { filtered: filtered.length, total: list.length })
            : t("queues.count", { filtered: filtered.length, total: list.length })}
        </span>
        <DensityToggle />
        <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> {t("queues.new")}
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8">
                <input
                  type="checkbox"
                  aria-label={t("queues.selected", { count: paged.length })}
                  checked={allPagedSelected}
                  onChange={toggleAllPaged}
                  className="h-3.5 w-3.5 accent-primary"
                />
              </TableHead>
              <TableHead>
                <SortButton field="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggle}>
                  {t("common.name")}
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton field="messages" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} className="justify-end">
                  {t("common.messages")}
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton field="messages_ready" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} className="justify-end">
                  {t("common.ready")}
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton field="messages_unacknowledged" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} className="justify-end">
                  {t("common.unacked")}
                </SortButton>
              </TableHead>
              <TableHead className="text-right">
                <SortButton field="consumers" sortKey={sortKey} sortDir={sortDir} onToggle={toggle} className="justify-end">
                  {t("common.consumers")}
                </SortButton>
              </TableHead>
              <TableHead>
                <SortButton field="state" sortKey={sortKey} sortDir={sortDir} onToggle={toggle}>
                  {t("common.state")}
                </SortButton>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7}>
                  <EmptyState
                    icon={Layers}
                    title={
                      search || stateFilter !== "all"
                        ? t("queues.emptyNoMatch")
                        : vhost
                          ? t("queues.emptyInVhost", { vhost })
                          : t("queues.emptyNone")
                    }
                    hint={
                      search || stateFilter !== "all"
                        ? t("queues.emptyNoMatchHint")
                        : t("queues.emptyNoneHint")
                    }
                    action={
                      !search && stateFilter === "all" ? (
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                          <Plus className="h-3.5 w-3.5" /> {t("queues.create")}
                        </Button>
                      ) : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              paged.map((q) => (
                <TableRow
                  key={`${q.vhost}/${q.name}`}
                  className="cursor-pointer"
                  onClick={() => setSelected(q)}
                >
                  <TableCell className="w-8" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={q.name}
                      checked={selectedKeys.has(keyOf(q))}
                      onChange={() => toggleQueue(q)}
                      className="h-3.5 w-3.5 accent-primary"
                    />
                  </TableCell>
                  <TableCell className={cn("font-medium", rowPad)}>
                    <span className="flex items-center gap-2">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-primary"
                        aria-label={
                          favorites.includes(keyOf(q))
                            ? t("queues.unfavorite")
                            : t("queues.favorite")
                        }
                        onClick={(event) => {
                          event.stopPropagation()
                          toggleFavorite(keyOf(q))
                        }}
                      >
                        <Star
                          className={cn(
                            "h-3.5 w-3.5",
                            favorites.includes(keyOf(q)) && "fill-current text-primary",
                          )}
                        />
                      </button>
                      <span className="truncate">{q.name}</span>
                      {queueType(q) !== "classic" && (
                        <Badge variant={TYPE_BADGES[queueType(q)] ?? "secondary"}>
                          {queueType(q)}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-right font-mono tnum", rowPad)}>
                    {(q.messages ?? 0).toLocaleString()}
                    {q.message_stats?.publish_details?.rate ? (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        {formatRate(q.message_stats.publish_details.rate)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className={cn("text-right font-mono tnum", rowPad)}>
                    {(q.messages_ready ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className={cn("text-right font-mono tnum", rowPad)}>
                    {(q.messages_unacknowledged ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className={cn("text-right font-mono tnum", rowPad)}>
                    {q.consumers ?? 0}
                  </TableCell>
                  <TableCell className={rowPad}>
                    <span className="inline-flex items-center gap-1.5 text-[13px]">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          q.state === "running" ? "bg-success" : "bg-warning",
                        )}
                      />
                      {q.state}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageCount={pageCount} onPage={setPage} />

      <QueueDrawer
        queue={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        onChanged={refresh}
      />

      <CreateQueueDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />

      <BulkQueueDialog
        open={bulkAction !== null}
        onOpenChange={(open) => {
          if (!open) setBulkAction(null)
        }}
        action={bulkAction ?? "purge"}
        queues={selectedQueues}
        onDone={() => {
          setSelectedKeys(new Set())
          refresh()
        }}
      />
    </div>
  )
}

function QueueTableSkeleton() {
  const t = useT()
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-[130px]" />
        <Skeleton className="ml-auto h-8 w-24" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8" />
              {[
                t("common.name"),
                t("common.messages"),
                t("common.ready"),
                t("common.unacked"),
                t("common.consumers"),
                t("common.state"),
              ].map((h) => (
                <TableHead key={h} className="text-xs">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-3.5 w-3.5" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-12" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                <TableCell className="text-right"><Skeleton className="ml-auto h-4 w-6" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
