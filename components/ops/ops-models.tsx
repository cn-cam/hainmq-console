"use client"

import * as React from "react"
import { Pencil, Plus, RefreshCw, Trash2, Wifi } from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
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
import { opsFetch, opsPost, opsPut } from "@/lib/ops/ui"
import type { ModelProfile } from "@/lib/ops/types"

type ModelView = Omit<ModelProfile, "apiKeyEnc"> & { hasApiKey?: boolean }

type ModelForm = {
  name: string
  provider: ModelProfile["provider"]
  baseUrl: string
  model: string
  apiKey: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  enabled: boolean
  isDefault: boolean
}

const EMPTY: ModelForm = {
  name: "",
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com",
  model: "",
  apiKey: "",
  temperature: 0.2,
  maxTokens: 1024,
  systemPrompt: "",
  enabled: true,
  isDefault: false,
}

export function OpsModels() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [models, setModels] = React.useState<ModelView[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ModelView | null>(null)
  const [form, setForm] = React.useState<ModelForm>(EMPTY)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      setModels(await opsFetch<ModelView[]>("/models"))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.loadFailed"))
    }
  }, [tr])

  React.useEffect(() => {
    const kickoff = setTimeout(() => void load(), 0)
    return () => clearTimeout(kickoff)
  }, [load])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY)
    setOpen(true)
  }

  const openEdit = (profile: ModelView) => {
    setEditing(profile)
    setForm({
      name: profile.name,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      model: profile.model,
      apiKey: "",
      temperature: profile.temperature,
      maxTokens: profile.maxTokens,
      systemPrompt: profile.systemPrompt || "",
      enabled: profile.enabled,
      isDefault: profile.isDefault,
    })
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = { ...form, systemPrompt: form.systemPrompt || null }
      if (editing) {
        await opsPut(`/models/${editing.id}`, payload)
      } else {
        await opsPost("/models", payload)
      }
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (profile: ModelView) => {
    if (!window.confirm(tr("common.confirmDelete"))) return
    try {
      await opsFetch(`/models/${profile.id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.generic"))
    }
  }

  const test = async (profile: ModelView) => {
    setMessage(null)
    try {
      const result = await opsPost<{ response: string }>(`/models/${profile.id}/test`, {})
      setMessage(`${tr("models.testSuccess")} · ${result.response}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.testFailed"))
    }
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
        <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> {tr("models.new")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("common.name")}</TableHead>
              <TableHead>{tr("models.provider")}</TableHead>
              <TableHead>{tr("models.model")}</TableHead>
              <TableHead>{tr("models.baseUrl")}</TableHead>
              <TableHead>{tr("common.status")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!models.length ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-xs text-muted-foreground">
                  {tr("models.empty")}
                </TableCell>
              </TableRow>
            ) : (
              models.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="text-xs font-medium">
                    {profile.name}
                    {profile.isDefault && (
                      <Badge variant="info" className="ml-1.5">
                        default
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{profile.provider}</TableCell>
                  <TableCell className="font-mono text-xs">{profile.model}</TableCell>
                  <TableCell className="max-w-[240px] truncate font-mono text-xs">
                    {profile.baseUrl}
                  </TableCell>
                  <TableCell>
                    <Badge variant={profile.enabled ? "success" : "secondary"}>
                      {profile.enabled ? tr("common.enabled") : tr("common.disabled")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => void test(profile)}
                      >
                        <Wifi className="h-3 w-3" /> {tr("common.test")}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(profile)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => void remove(profile)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? tr("models.edit") : tr("models.new")}</DialogTitle>
            <DialogDescription>{tr("models.baseUrlHint")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("common.name")}</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("models.provider")}</Label>
              <Select
                value={form.provider}
                onValueChange={(value) =>
                  setForm({ ...form, provider: value as ModelForm["provider"] })
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai-compatible">{tr("models.providerOpenAI")}</SelectItem>
                  <SelectItem value="ollama">{tr("models.providerOllama")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">{tr("models.baseUrl")}</Label>
              <Input
                value={form.baseUrl}
                onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("models.model")}</Label>
              <Input
                value={form.model}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("models.apiKey")}</Label>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(event) => setForm({ ...form, apiKey: event.target.value })}
                className="h-9 font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">{tr("models.apiKeyHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("models.temperature")}</Label>
              <Input
                type="number"
                step="0.1"
                value={form.temperature}
                onChange={(event) => setForm({ ...form, temperature: Number(event.target.value) })}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tr("models.maxTokens")}</Label>
              <Input
                type="number"
                value={form.maxTokens}
                onChange={(event) => setForm({ ...form, maxTokens: Number(event.target.value) })}
                className="h-9 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">{tr("models.systemPrompt")}</Label>
              <textarea
                value={form.systemPrompt}
                onChange={(event) => setForm({ ...form, systemPrompt: event.target.value })}
                className="min-h-[90px] w-full rounded-md border bg-transparent px-3 py-2 text-xs"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">{tr("common.enabled")}</span>
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm({ ...form, enabled })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm">{tr("models.isDefault")}</span>
              <Switch
                checked={form.isDefault}
                onCheckedChange={(isDefault) => setForm({ ...form, isDefault })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tr("common.cancel")}
            </Button>
            <Button
              onClick={() => void save()}
              disabled={saving || !form.name.trim() || !form.baseUrl.trim() || !form.model.trim()}
            >
              {saving ? tr("common.loading") : tr("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
