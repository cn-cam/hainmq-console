import type { OpsAlert, OpsSettings, OpsTarget, Severity } from "@/lib/ops/types"

export interface LatestMetric {
  value: number
  ts: number
}

export interface OpsTargetView extends Omit<OpsTarget, "passwordEnc"> {
  latest: Record<string, LatestMetric>
  queueTop: Array<{ name: string; value: number; delta?: number; perHour?: number }>
  series: {
    publish: Array<{ ts: number; value: number }>
    deliver: Array<{ ts: number; value: number }>
    queued: Array<{ ts: number; value: number }>
  }
}

export interface OpsOverviewResponse {
  targets: OpsTargetView[]
  activeAlerts: OpsAlert[]
  counts: { targets: number; rules: number; channels: number }
  settings: OpsSettings
}

export interface OpsAlertView extends OpsAlert {
  severity: Severity
}

export interface OpsMe {
  role: "admin" | "operator" | "viewer"
  username: string
  isAdmin: boolean
  twoPersonApproval: boolean
}
