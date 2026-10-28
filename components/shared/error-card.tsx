"use client"

import { AlertTriangle, RefreshCw, WifiOff, ShieldAlert, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useT } from "@/lib/i18n/client"
import type { MessageKey } from "@/lib/i18n/dictionaries"
import type { ErrorType } from "@/lib/rabbitmq/errors"

interface ErrorCardProps {
  title?: string
  message: string
  type?: ErrorType
  details?: string
  onRetry?: () => void
}

const errorIcons: Record<ErrorType, React.ReactNode> = {
  CONNECTION: <WifiOff className="h-5 w-5" />,
  AUTH: <ShieldAlert className="h-5 w-5" />,
  TIMEOUT: <Clock className="h-5 w-5" />,
  API: <AlertTriangle className="h-5 w-5" />,
  UNKNOWN: <AlertTriangle className="h-5 w-5" />,
}

const errorHintKeys: Record<ErrorType, MessageKey[]> = {
  CONNECTION: [
    "error.hints.connection1",
    "error.hints.connection2",
    "error.hints.connection3",
  ],
  AUTH: [
    "error.hints.auth1",
    "error.hints.auth2",
  ],
  TIMEOUT: [
    "error.hints.timeout1",
    "error.hints.timeout2",
  ],
  API: [
    "error.hints.api1",
    "error.hints.api2",
  ],
  UNKNOWN: [
    "error.hints.unknown1",
    "error.hints.unknown2",
  ],
}

export function ErrorCard({ title, message, type = "UNKNOWN", details, onRetry }: ErrorCardProps) {
  const t = useT()
  return (
    <Card className="border-destructive/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          {errorIcons[type]}
          <span className="text-base">{title || t("error.somethingWentWrong")}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{message}</p>

        <ul className="space-y-1">
          {errorHintKeys[type].map((hint, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
              {t(hint)}
            </li>
          ))}
        </ul>

        {details && (
          <pre className="rounded-md bg-muted p-2 text-xs font-mono text-muted-foreground overflow-auto max-h-20">
            {details}
          </pre>
        )}

        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            {t("error.retry")}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
