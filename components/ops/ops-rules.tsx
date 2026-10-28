"use client"

import * as React from "react"
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
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
import { METRICS, getMetricDefinition } from "@/lib/ops/metrics"
import { opsText } from "@/lib/ops/ui-text"
import { opsFetch, opsPost, opsPut } from "@/lib/ops/ui"
import type { OpsChannel, OpsRule, OpsTarget } from "@/lib/ops/types"

type RuleForm = {
  name: string
  targetId: number
  scopeType: OpsRule["scopeType"]
  scopeValue: string
  metric: string
  operator: OpsRule["operator"]
  threshold: number
  durationSec: number
  severity: OpsRule["severity"]
  enabled: boolean
  channelIds: number[]
  template: string
  cooldownSec: number
}

const EMPTY_FORM: RuleForm = {
  name: "",
  targetId: 1,
  scopeType: "global",
  scopeValue: "*",
  metric: "service.reachable",
  operator: "<",
  threshold: 1,
  durationSec: 60,
  severity: "warning",
  enabled: true,
  channelIds: [],
  template: "",
  cooldownSec: 900,
}

export function OpsRules() {
  const { locale } = useI18n()
  const tr = React.useCallback(
    (key: Parameters<typeof opsText>[1]) => opsText(locale, key),
    [locale],
  )
  const [rules, setRules] = React.useState<OpsRule[]>([])
  const [targets, setTargets] = React.useState<OpsTarget[]>([])
  const [channels, setChannels] = React.useState<OpsChannel[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<OpsRule | null>(null)
  const [form, setForm] = React.useState<RuleForm>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    try {
      const [ruleList, targetList, channelList] = await Promise.all([
        opsFetch<OpsRule[]>("/rules"),
        opsFetch<OpsTarget[]>("/targets"),
        opsFetch<OpsChannel[]>("/channels"),
      ])
      setRules(ruleList)
      setTargets(targetList)
      setChannels(channelList)
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
    setForm({ ...EMPTY_FORM, targetId: targets[0]?.id ?? 1 })
    setOpen(true)
  }

  const openEdit = (rule: OpsRule) => {
    setEditing(rule)
    setForm({
      name: rule.name,
      targetId: rule.targetId,
      scopeType: rule.scopeType,
      scopeValue: rule.scopeValue,
      metric: rule.metric,
      operator: rule.operator,
      threshold: rule.threshold,
      durationSec: rule.durationSec,
      severity: rule.severity,
      enabled: rule.enabled,
      channelIds: rule.channelIds,
      template: rule.template || "",
      cooldownSec: rule.cooldownSec,
    })
    setOpen(true)
  }

  const changeMetric = (metricKey: string) => {
    const definition = getMetricDefinition(metricKey)
    setForm((current) => ({
      ...current,
      metric: metricKey,
      scopeType: definition?.objectType ?? "global",
      scopeValue: definition?.objectType === "global" ? "*" : current.scopeValue,
      operator: definition?.defaultOperator ?? current.operator,
      threshold: definition?.defaultThreshold ?? current.threshold,
    }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        ...form,
        targetId: Number(form.targetId),
        threshold: Number(form.threshold),
        durationSec: Number(form.durationSec),
        cooldownSec: Number(form.cooldownSec),
        template: form.template || null,
      }
      if (editing) {
        await opsPut(`/rules/${editing.id}`, payload)
      } else {
        await opsPost("/rules", payload)
      }
      setOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.saveFailed"))
    } finally {
      setSaving(false)
    }
  }

  const remove = async (rule: OpsRule) => {
    if (!window.confirm(tr("common.confirmDelete"))) return
    try {
      await opsFetch(`/rules/${rule.id}`, { method: "DELETE" })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("errors.generic"))
    }
  }

  const targetName = (id: number) => targets.find((target) => target.id === id)?.name ?? `#${id}`
  const channelName = (id: number) => channels.find((channel) => channel.id === id)?.name ?? `#${id}`
  const metricLabel = (key: string) => {
    const definition = getMetricDefinition(key)
    if (!definition) return key
    return locale === "zh-CN" ? definition.labelZh : definition.label
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" /> {tr("common.refresh")}
        </Button>
        <Button size="sm" className="ml-auto h-8 gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" /> {tr("rules.new")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("common.name")}</TableHead>
              <TableHead>{tr("common.target")}</TableHead>
              <TableHead>{tr("rules.metric")}</TableHead>
              <TableHead>{tr("rules.scopeValue")}</TableHead>
              <TableHead>{tr("rules.threshold")}</TableHead>
              <TableHead>{tr("rules.duration")}</TableHead>
              <TableHead>{tr("common.severity")}</TableHead>
              <TableHead>{tr("rules.channels")}</TableHead>
              <TableHead>{tr("common.enabled")}</TableHead>
              <TableHead>{tr("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!rules.length ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-xs text-muted-foreground">
                  {tr("rules.empty")}
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="text-xs font-medium">{rule.name}</TableCell>
                  <TableCell className="text-xs">{targetName(rule.targetId)}</TableCell>
                  <TableCell className="text-xs">{metricLabel(rule.metric)}</TableCell>
                  <TableCell className="font-mono text-xs">{rule.scopeValue}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {rule.operator} {rule.threshold}
                  </TableCell>
                  <TableCell className="text-xs">{rule.durationSec}s</TableCell>
                  <TableCell>
                    <span className="text-xs">{tr(`severity.${rule.severity}` as Parameters<typeof opsText>[1])}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {rule.channelIds.length ? (
                        rule.channelIds.map((id) => (
                          <Badge key={id} variant="secondary">
                            {channelName(id)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">{tr("common.none")}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={rule.enabled ? "success" : "secondary"}>
                      {rule.enabled ? tr("common.enabled") : tr("common.disabled")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => void remove(rule)}
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
            <DialogTitle>{editing ? tr("rules.edit") : tr("rules.new")}</DialogTitle>
            <DialogDescription>{tr("rules.channelHelp")}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">{tr("common.name")}</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder={tr("rules.namePlaceholder")}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr("common.target")}</Label>
              <Select
                value={String(form.targetId)}
                onValueChange={(value) => setForm({ ...form, targetId: Number(value) })}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((target) => (
                    <SelectItem key={target.id} value={String(target.id)}>
                      {target.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr("rules.metric")}</Label>
              <Select value={form.metric} onValueChange={changeMetric}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((metric) => (
                    <SelectItem key={metric.key} value={metric.key}>
                      {locale === "zh-CN" ? metric.labelZh : metric.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr("rules.scopeValue")}</Label>
              <Input
                value={form.scopeValue}
                onChange={(event) => setForm({ ...form, scopeValue: event.target.value })}
                className="h-9 font-mono text-sm"
                disabled={form.scopeType === "global"}
              />
              <p className="text-[10px] text-muted-foreground">{tr("rules.scopeHelp")}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr("rules.operator")}</Label>
              <Select
                value={form.operator}
                onValueChange={(value) =>
                  setForm({ ...form, operator: value as RuleForm["operator"] })
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[">", ">=", "<", "<=", "==", "!="].map((operator) => (
                    <SelectItem key={operator} value={operator}>
                      {operator}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr("rules.threshold")}</Label>
              <Input
                type="number"
                value={form.threshold}
                onChange={(event) => setForm({ ...form, threshold: Number(event.target.value) })}
                className="h-9 font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr("rules.duration")} (s)</Label>
              <Input
                type="number"
                value={form.durationSec}
                onChange={(event) => setForm({ ...form, durationSec: Number(event.target.value) })}
                className="h-9 font-mono text-sm"
              />
              <p className="text-[10px] text-muted-foreground">{tr("rules.durationHelp")}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr("common.severity")}</Label>
              <Select
                value={form.severity}
                onValueChange={(value) =>
                  setForm({ ...form, severity: value as RuleForm["severity"] })
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["info", "warning", "critical"].map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {tr(`severity.${severity}` as Parameters<typeof opsText>[1])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{tr("rules.cooldown")} (s)</Label>
              <Input
                type="number"
                value={form.cooldownSec}
                onChange={(event) => setForm({ ...form, cooldownSec: Number(event.target.value) })}
                className="h-9 font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">{tr("rules.channels")}</Label>
              <div className="flex flex-wrap gap-2 rounded-lg border p-3">
                {!channels.length ? (
                  <span className="text-xs text-muted-foreground">{tr("channels.empty")}</span>
                ) : (
                  channels.map((channel) => {
                    const selected = form.channelIds.includes(channel.id)
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            channelIds: selected
                              ? form.channelIds.filter((id) => id !== channel.id)
                              : [...form.channelIds, channel.id],
                          })
                        }
                        className={`rounded-md border px-2 py-1 text-xs ${
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "text-muted-foreground"
                        }`}
                      >
                        {channel.name}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">{tr("rules.template")}</Label>
              <Input
                value={form.template}
                onChange={(event) => setForm({ ...form, template: event.target.value })}
                className="h-9 text-sm"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
              <span className="text-sm">{tr("common.enabled")}</span>
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm({ ...form, enabled })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tr("common.cancel")}
            </Button>
            <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>
              {saving ? tr("common.loading") : tr("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
