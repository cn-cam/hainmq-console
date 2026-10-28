import { redirect } from "next/navigation"
import { getSessionFromCookie } from "@/lib/auth/session"
import { getOpsUser } from "@/lib/ops/auth"
import { getSettings } from "@/lib/ops/settings"
import { getLocale } from "@/lib/i18n/server"
import { opsText } from "@/lib/ops/ui-text"
import { OpsNav } from "@/components/ops/ops-nav"

export const dynamic = "force-dynamic"

export default async function OpsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionFromCookie()
  if (!session) redirect("/login?next=/ops")

  const user = await getOpsUser()
  if (!user) {
    const locale = await getLocale()
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold text-destructive">
          {opsText(locale, "errors.noPermission")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          RabbitMQ user <span className="font-mono">{session.user.username}</span> needs the
          administrator, policymaker, management, or monitoring tag.
        </p>
      </div>
    )
  }

  const settings = getSettings()

  return (
    <div className="space-y-5">
      <OpsNav role={user.role} username={user.username} chatEnabled={settings.chatEnabled} />
      {children}
    </div>
  )
}
