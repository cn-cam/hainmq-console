"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Bell,
  Check,
  ChevronDown,
  Command as CommandIcon,
  Globe,
  LogOut,
  Menu,
  Moon,
  Pause,
  RefreshCw,
  Server,
  ShieldCheck,
  Sun,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { CommandMenu } from "@/components/layout/command-menu"
import { LocaleSwitcher } from "@/components/layout/locale-switcher"
import { useAuth } from "@/lib/auth/store"
import { useBranding } from "@/lib/branding/client"
import {
  REFRESH_INTERVALS,
  useConnectionStatus,
  usePreferences,
} from "@/lib/stores/preferences"
import { useT } from "@/lib/i18n/client"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import { usePolling } from "@/hooks/use-polling"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import type { ClusterSummary, VHost } from "@/lib/rabbitmq/types"
import type { OpsAlert } from "@/lib/ops/types"

const PAGE_TITLES: Record<string, MessageKey> = {
  "/": "nav.overview",
  "/queues": "nav.queues",
  "/exchanges": "nav.exchanges",
  "/connections": "nav.connections",
  "/channels": "nav.channels",
  "/topology": "nav.topology",
  "/admin": "nav.admin",
}

const STATUS_META = {
  connected: { labelKey: "status.connected", dot: "bg-success", pulse: false },
  degraded: { labelKey: "status.degraded", dot: "bg-warning", pulse: true },
  disconnected: { labelKey: "status.disconnected", dot: "bg-destructive", pulse: true },
  unknown: { labelKey: "status.connecting", dot: "bg-muted-foreground", pulse: false },
} as const

export function Header({ onMobileMenu }: { onMobileMenu?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()
  const branding = useBranding()
  const { setTheme, resolvedTheme } = useTheme()
  const { user, cluster, setAuth, clearAuth, hydrate } = useAuth()
  const { refreshInterval, setRefreshInterval, vhost, setVhost } = usePreferences()
  const status = useConnectionStatus((s) => s.status)
  const { toast } = useToast()
  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [clusters, setClusters] = React.useState<ClusterSummary[]>([])
  const [switchingCluster, setSwitchingCluster] = React.useState(false)
  const [alerts, setAlerts] = React.useState<OpsAlert[]>([])
  const [hasOpsAccess, setHasOpsAccess] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/ops/alerts?limit=20", { cache: "no-store" })
        if (res.status === 403) {
          if (!cancelled) setHasOpsAccess(false)
          return
        }
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data)) {
          setAlerts(data.filter((alert: OpsAlert) => alert.status !== "resolved"))
          setHasOpsAccess(true)
        }
      } catch {
        // Keep the previous alert list on transient failures.
      }
    }
    void load()
    const timer = setInterval(() => void load(), 30_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    fetch("/api/clusters")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.clusters)) setClusters(data.clusters)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const switchCluster = async (clusterId: string) => {
    if (!clusterId || clusterId === cluster?.id) return
    setSwitchingCluster(true)
    try {
      const res = await fetch("/api/auth/switch-cluster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({
          title: t("header.clusterSwitchFailed"),
          description: data.error,
          variant: "destructive",
        })
        return
      }
      setVhost(null)
      setAuth(data.user, data.cluster ?? null)
      window.location.reload()
    } catch {
      toast({
        title: t("header.clusterSwitchFailed"),
        description: t("error.unreachable"),
        variant: "destructive",
      })
    } finally {
      setSwitchingCluster(false)
    }
  }

  // Restore user info after hard reloads
  React.useEffect(() => {
    hydrate()
  }, [hydrate])

  // Global shortcut: ⌘K / Ctrl+K
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // VHost list refreshes slowly — it rarely changes
  const { data: vhosts } = usePolling<VHost[]>("/api/rabbitmq/vhosts", { interval: 60_000 })

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    clearAuth()
    router.push("/login")
  }

  const title = pathname.startsWith("/ops")
    ? t("nav.ops")
    : PAGE_TITLES[pathname]
      ? t(PAGE_TITLES[pathname])
      : branding.name
  const meta = STATUS_META[status]
  const currentInterval = REFRESH_INTERVALS.find((i) => i.value === refreshInterval)
  const intervalLabel = (ms: number) =>
    ms === 0 ? t("header.off") : t("header.seconds", { count: ms / 1000 })
  const currentCluster = cluster ?? clusters[0] ?? null

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md lg:px-6">
      {/* Mobile menu */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 lg:hidden"
        onClick={onMobileMenu}
      >
        <Menu className="h-4 w-4" />
        <span className="sr-only">{t("header.openNavigation")}</span>
      </Button>

      <h1 className="text-[15px] font-semibold tracking-tight">{title}</h1>

      {/* Broker status */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground sm:inline-flex">
            <span className="relative flex h-1.5 w-1.5">
              {meta.pulse && (
                <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", meta.dot)} />
              )}
              <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", meta.dot)} />
            </span>
            {t(meta.labelKey)}
          </span>
        </TooltipTrigger>
        <TooltipContent>{t("header.brokerStatus")}</TooltipContent>
      </Tooltip>

      <div className="ml-auto flex items-center gap-1.5">
        {clusters.length > 1 && currentCluster && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="hidden h-8 gap-1.5 px-2.5 text-xs text-muted-foreground sm:inline-flex"
                disabled={switchingCluster}
              >
                <Server className="h-3.5 w-3.5" />
                <span className="max-w-[140px] truncate">{currentCluster.name}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuLabel>{t("header.cluster")}</DropdownMenuLabel>
              {clusters.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => void switchCluster(item.id)}
                  disabled={switchingCluster}
                >
                  <span className="truncate">{item.name}</span>
                  {item.id === currentCluster.id && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* VHost scope */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="hidden h-8 gap-1.5 px-2.5 text-xs text-muted-foreground md:inline-flex">
              <Globe className="h-3.5 w-3.5" />
              <span className="max-w-[120px] truncate font-mono">{vhost ?? t("header.allVhosts")}</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuLabel>{t("header.virtualHost")}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setVhost(null)}>
              {t("header.allVhosts")}
              {vhost === null && <Check className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
            {(vhosts ?? []).map((v) => (
              <DropdownMenuItem key={v.name} onClick={() => setVhost(v.name)}>
                <span className="font-mono text-xs">{v.name}</span>
                {vhost === v.name && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Refresh cadence */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground">
              {refreshInterval === 0 ? (
                <>
                  <Pause className="h-3.5 w-3.5 text-warning" />
                  <span className="hidden sm:inline">{t("header.paused")}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{intervalLabel(currentInterval?.value ?? refreshInterval)}</span>
                </>
              )}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("header.refreshEvery")}</DropdownMenuLabel>
            {REFRESH_INTERVALS.map((opt) => (
              <DropdownMenuItem key={opt.value} onClick={() => setRefreshInterval(opt.value)}>
                {intervalLabel(opt.value)}
                {refreshInterval === opt.value && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {hasOpsAccess && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-8 w-8">
                <Bell className="h-4 w-4" />
                {alerts.length > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground">
                    {alerts.length > 99 ? "99+" : alerts.length}
                  </span>
                )}
                <span className="sr-only">{t("header.alerts")}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[320px]">
              <DropdownMenuLabel>{t("header.alerts")}</DropdownMenuLabel>
              {alerts.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  {t("header.noAlerts")}
                </div>
              ) : (
                alerts.slice(0, 6).map((alert) => (
                  <DropdownMenuItem
                    key={alert.id}
                    onClick={() => router.push("/ops/alerts")}
                    className="items-start gap-2"
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                        alert.severity === "critical"
                          ? "bg-destructive"
                          : alert.severity === "warning"
                            ? "bg-warning"
                            : "bg-muted-foreground",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs">{alert.message}</span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">
                        {alert.objectName} · {alert.metric}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/ops/alerts")}>
                {t("header.viewAlerts")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Command palette */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
              onClick={() => setPaletteOpen(true)}
            >
              <CommandIcon className="h-3.5 w-3.5" />
              <kbd className="hidden rounded border bg-muted px-1 font-mono text-[10px] sm:inline">K</kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("header.commandPalette")}</TooltipContent>
        </Tooltip>

        <LocaleSwitcher compact />

        {/* Theme */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 scale-100 rotate-0 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          <span className="sr-only">{t("header.toggleTheme")}</span>
        </Button>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <User className="h-4 w-4" />
              <span className="sr-only">{t("header.account")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              <span className="font-mono text-xs">{user?.username ?? "—"}</span>
              {user?.isAdmin && (
                <Badge variant="default" className="gap-0.5">
                  <ShieldCheck className="h-2.5 w-2.5" /> {t("header.admin")}
                </Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut /> {t("header.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandMenu open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  )
}
