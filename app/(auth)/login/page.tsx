"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Activity,
  BellRing,
  Bot,
  Eye,
  EyeOff,
  Loader2,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { BrandMark } from "@/components/branding/brand-mark"
import { BrandingFooter } from "@/components/branding/branding-footer"
import { LocaleSwitcher } from "@/components/layout/locale-switcher"
import { useAuth } from "@/lib/auth/store"
import { useBranding } from "@/lib/branding/client"
import { useT } from "@/lib/i18n/client"
import type { ClusterSummary } from "@/lib/rabbitmq/types"
import { motion } from "motion/react"

const FEATURES = [
  { icon: Activity, key: "login.feature.monitoring" as const },
  { icon: BellRing, key: "login.feature.alerting" as const },
  { icon: Bot, key: "login.feature.automation" as const },
]

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setAuth } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const branding = useBranding()
  const t = useT()
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clusters, setClusters] = useState<ClusterSummary[]>([])
  const [clusterId, setClusterId] = useState("")

  useEffect(() => {
    let cancelled = false
    fetch("/api/clusters")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.clusters?.length) return
        setClusters(data.clusters)
        setClusterId(data.defaultId ?? data.clusters[0].id)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const form = new FormData(e.currentTarget)
    const username = form.get("username") as string
    const password = form.get("password") as string

    if (!username || !password) {
      setError(t("login.errorRequired"))
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, clusterId }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 400) {
          setError(t("login.errorRequired"))
        } else if (res.status === 401 || res.status === 403) {
          setError(t("login.errorInvalid"))
        } else if (res.status === 408 || res.status === 502 || res.status === 503) {
          setError(t("login.errorConnection"))
        } else {
          setError(data.error || t("login.errorAuthFailed"))
        }
        return
      }

      if (data.authenticated && data.user) {
        setAuth(data.user, data.cluster ?? null)
        // Return to the page the user originally asked for — resolved
        // against our own origin so ?next= can never leave the app
        // (URL parsing also neutralizes backslash normalization tricks).
        let dest = "/"
        const next = searchParams.get("next")
        if (next) {
          try {
            const u = new URL(next, window.location.origin)
            if (u.origin === window.location.origin) dest = u.pathname + u.search + u.hash
          } catch {
            // Malformed — fall back to the dashboard
          }
        }
        router.push(dest)
        router.refresh()
      } else {
        setError(t("login.errorInvalidResponse"))
      }
    } catch {
      setError(t("login.errorConnection"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 42%), radial-gradient(circle at 82% 82%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 42%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in srgb, var(--border) 25%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--border) 25%, transparent) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
      <div className="pointer-events-none absolute -left-32 top-1/3 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[130px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-[360px] w-[360px] rounded-full bg-primary/10 blur-[120px]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 sm:px-8 lg:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 lg:hidden">
            <BrandMark size={32} priority />
            <div>
              <p className="text-sm font-semibold tracking-tight">{branding.name}</p>
              <p className="text-[10px] text-muted-foreground">{branding.productName}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <LocaleSwitcher compact />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              aria-label={t("header.toggleTheme")}
            >
              <Sun className="h-4 w-4 dark:hidden" />
              <Moon className="hidden h-4 w-4 dark:block" />
            </Button>
          </div>
        </div>

        <div className="grid flex-1 items-center gap-12 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:py-14">
          <section className="hidden lg:block">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-[11px]">
                <Sparkles className="h-3 w-3 text-primary" />
                {t("login.workspace")}
              </Badge>

              <div className="mt-8 flex items-center gap-4">
                <div className="relative">
                  <BrandMark size={58} priority />
                  <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/15 blur-2xl" />
                </div>
                <div>
                  <h1 className="text-4xl font-semibold tracking-tight">{branding.name}</h1>
                  <p className="mt-1 text-lg text-muted-foreground">{branding.productName}</p>
                </div>
              </div>

              <p className="mt-6 max-w-lg text-sm leading-7 text-muted-foreground">
                {t("login.brandTagline")}
              </p>

              <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
                {FEATURES.map(({ icon: Icon, key }) => (
                  <div
                    key={key}
                    className="rounded-xl border border-border/60 bg-card/40 p-3.5 backdrop-blur"
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                      {t(key)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-center gap-2 text-[11px] text-muted-foreground/70">
                <ShieldCheck className="h-3.5 w-3.5 text-primary/80" />
                {t("login.secureBadge")}
              </div>
            </motion.div>
          </section>

          <section className="mx-auto w-full max-w-[420px]">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
              className="rounded-2xl border border-border/60 bg-card/80 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
            >
              <div className="mb-7">
                <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-primary/80">
                  {branding.productName}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  {t("login.welcome")}
                </h2>
                <p className="mt-1.5 text-sm text-muted-foreground">{t("login.subtitle")}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {clusters.length > 1 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t("login.cluster")}
                    </Label>
                    <Select value={clusterId} onValueChange={setClusterId} disabled={loading}>
                      <SelectTrigger className="h-11 rounded-xl border-border/60 bg-background/60">
                        <SelectValue placeholder={t("login.clusterPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {clusters.map((cluster) => (
                          <SelectItem key={cluster.id} value={cluster.id}>
                            {cluster.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="username" className="text-xs font-medium text-muted-foreground">
                    {t("login.username")}
                  </Label>
                  <Input
                    id="username"
                    name="username"
                    placeholder={t("login.usernamePlaceholder")}
                    autoComplete="username"
                    autoFocus
                    disabled={loading}
                    className="h-11 rounded-xl border-border/60 bg-background/60 transition-all focus:border-primary/50 focus:bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                    {t("login.password")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPw ? "text" : "password"}
                      placeholder={t("login.passwordPlaceholder")}
                      autoComplete="current-password"
                      disabled={loading}
                      className="h-11 rounded-xl border-border/60 bg-background/60 pr-11 transition-all focus:border-primary/50 focus:bg-background"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
                  >
                    {error}
                  </motion.div>
                )}

                <Button
                  type="submit"
                  className="h-11 w-full rounded-xl font-medium shadow-lg shadow-primary/10"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("login.connecting")}
                    </>
                  ) : (
                    t("login.signIn")
                  )}
                </Button>
              </form>

              <p className="mt-5 flex items-start gap-2 text-[11px] leading-5 text-muted-foreground/70">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t("login.note")}
              </p>
            </motion.div>
          </section>
        </div>

        <BrandingFooter className="mt-auto text-center lg:text-left" />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
