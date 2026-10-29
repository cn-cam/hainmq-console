"use client"

import * as React from "react"
import { Download, Loader2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { useAdminText } from "@/lib/admin/client"
import { adminFetch, adminPost } from "@/lib/admin/api"
import { AdminError } from "./shared"

export function AdminDefinitions() {
  const tr = useAdminText()
  const { toast } = useToast()
  const [exporting, setExporting] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [importData, setImportData] = React.useState<unknown>(null)
  const [fileName, setFileName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const exportDefinitions = async () => {
    setExporting(true)
    setError(null)
    try {
      const data = await adminFetch<unknown>("/definitions")
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `hainmq-definitions-${new Date().toISOString().slice(0, 10)}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      toast({ title: tr("definitions.exported") })
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("common.requestFailed"))
    } finally {
      setExporting(false)
    }
  }

  const selectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      setImportData(JSON.parse(text))
      setFileName(file.name)
    } catch {
      setImportData(null)
      setFileName("")
      setError(tr("definitions.invalidFile"))
    }
  }

  const importDefinitions = async () => {
    if (!importData) return
    if (!window.confirm(tr("definitions.importConfirm"))) return
    setImporting(true)
    setError(null)
    try {
      await adminPost("/definitions", importData)
      toast({ title: tr("definitions.imported"), description: fileName })
      setImportData(null)
      setFileName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("common.requestFailed"))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">{tr("definitions.title")}</h3>
        <p className="text-sm text-muted-foreground">{tr("definitions.description")}</p>
      </div>
      <AdminError message={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{tr("definitions.export")}</CardTitle>
            <CardDescription>{tr("definitions.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => void exportDefinitions()}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {tr("definitions.export")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{tr("definitions.import")}</CardTitle>
            <CardDescription>{tr("definitions.importHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="file"
              accept="application/json,.json"
              onChange={(event) => void selectFile(event)}
              disabled={importing}
              className="cursor-pointer"
            />
            {fileName && <p className="font-mono text-xs text-muted-foreground">{fileName}</p>}
            <Button
              className="gap-2"
              onClick={() => void importDefinitions()}
              disabled={!importData || importing}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {tr("definitions.import")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
