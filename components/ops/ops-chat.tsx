"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2, Send, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useI18n } from "@/lib/i18n/client"
import { opsText } from "@/lib/ops/ui-text"
import { opsFetch, opsPost } from "@/lib/ops/ui"
import type { ModelProfile, OpsSettings } from "@/lib/ops/types"

interface ChatToolCall {
  name: string
  arguments: unknown
  result: unknown
}

interface ChatEntry {
  role: "user" | "assistant"
  content: string
  toolCalls?: ChatToolCall[]
}

interface ChatResponse {
  sessionId: string
  content: string
  toolCalls: ChatToolCall[]
}

type ModelView = Omit<ModelProfile, "apiKeyEnc"> & { hasApiKey?: boolean }

export function OpsChat() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [models, setModels] = React.useState<ModelView[]>([])
  const [chatEnabled, setChatEnabled] = React.useState(true)
  const [profileId, setProfileId] = React.useState<string>("")
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatEntry[]>([])
  const [input, setInput] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const bottomRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    async function loadModels() {
      try {
        const [list, settings] = await Promise.all([
          opsFetch<ModelView[]>("/models"),
          opsFetch<OpsSettings>("/settings"),
        ])
        setChatEnabled(settings.chatEnabled)
        const enabled = list.filter((model) => model.enabled)
        setModels(enabled)
        const preferred = enabled.find((model) => model.isDefault) || enabled[0]
        setProfileId(preferred ? String(preferred.id) : "")
      } catch (err) {
        setError(err instanceof Error ? err.message : tr("errors.loadFailed"))
      }
    }
    void loadModels()
  }, [tr])

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, sending])

  const send = async () => {
    const message = input.trim()
    if (!message || sending || !profileId) return
    setInput("")
    setMessages((current) => [...current, { role: "user", content: message }])
    setSending(true)
    setError(null)
    try {
      const result = await opsPost<ChatResponse>("/chat", {
        sessionId,
        profileId: Number(profileId),
        message,
      })
      setSessionId(result.sessionId)
      setMessages((current) => [
        ...current,
        { role: "assistant", content: result.content, toolCalls: result.toolCalls },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("chat.error"))
      setMessages((current) => [
        ...current,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : tr("chat.error")}` },
      ])
    } finally {
      setSending(false)
    }
  }

  const approvalRequired = messages.some((entry) =>
    entry.toolCalls?.some((call) => {
      const result = call.result as { status?: string } | null
      return result?.status === "approval_required"
    }),
  )

  if (!chatEnabled) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {tr("chat.disabled")}
        </CardContent>
      </Card>
    )
  }

  if (!models.length) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {tr("chat.noModels")}{" "}
          <Link href="/ops/models" className="text-primary underline">
            {tr("tabs.models")}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="flex h-[calc(100vh-230px)] min-h-[420px] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="mr-auto">
          <p className="text-sm font-medium">{tr("chat.title")}</p>
          <p className="text-[11px] text-muted-foreground">{tr("chat.subtitle")}</p>
        </div>
        <Select value={profileId} onValueChange={setProfileId}>
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue placeholder={tr("chat.model")} />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={model.id} value={String(model.id)}>
                {model.name} · {model.model}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {approvalRequired && (
          <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-xs">
            <Link href="/ops/approvals">
              <Wrench className="h-3.5 w-3.5" /> {tr("chat.openApprovals")}
            </Link>
          </Button>
        )}
      </div>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!messages.length && (
          <p className="mx-auto max-w-md py-10 text-center text-xs text-muted-foreground">
            {tr("chat.empty")}
          </p>
        )}
        {messages.map((entry, index) => (
          <div
            key={index}
            className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                entry.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border bg-card"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{entry.content}</p>
              {entry.toolCalls && entry.toolCalls.length > 0 && (
                <details className="mt-2 rounded-md border bg-muted/30 px-2 py-1.5 text-[11px]">
                  <summary className="cursor-pointer text-muted-foreground">
                    {tr("chat.toolCalls")} ({entry.toolCalls.length})
                  </summary>
                  <div className="mt-2 space-y-2">
                    {entry.toolCalls.map((call, callIndex) => (
                      <div key={callIndex}>
                        <p className="font-mono text-[11px] text-primary">{call.name}</p>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/60 p-2 font-mono text-[10px]">
                          {JSON.stringify(call.arguments, null, 2)}
                        </pre>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-background/60 p-2 font-mono text-[10px]">
                          {JSON.stringify(call.result, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {tr("chat.sending")}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t p-3">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          placeholder={tr("chat.placeholder")}
          className="h-9 flex-1"
          disabled={sending}
        />
        <Button
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => void send()}
          disabled={sending || !input.trim() || !profileId}
        >
          {sending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {tr("chat.send")}
        </Button>
      </div>
    </Card>
  )
}
