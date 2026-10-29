import { getDb, now } from "@/lib/ops/db"

export const dynamic = "force-dynamic"

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"')
}

function labels(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
    .join(",")
}

export async function GET(request: Request) {
  const expected = process.env.OPS_METRICS_TOKEN
  if (expected) {
    const header = request.headers.get("authorization") || ""
    if (header !== `Bearer ${expected}`) {
      return new Response("Unauthorized\n", { status: 401 })
    }
  }

  const db = getDb()
  const since = now() - 10 * 60 * 1000
  const rows = db
    .prepare(
      `SELECT s.target_id, t.name AS target_name, s.object_type, s.object_name, s.metric, s.value, s.ts
       FROM ops_samples s
       INNER JOIN ops_targets t ON t.id = s.target_id
       INNER JOIN (
         SELECT target_id, object_type, object_name, metric, MAX(ts) AS max_ts
         FROM ops_samples
         WHERE ts >= ?
         GROUP BY target_id, object_type, object_name, metric
       ) latest
       ON latest.target_id = s.target_id
       AND latest.object_type = s.object_type
       AND latest.object_name = s.object_name
       AND latest.metric = s.metric
       AND latest.max_ts = s.ts
       ORDER BY s.target_id, s.object_type, s.object_name, s.metric`,
    )
    .all(since) as Array<{
    target_id: number
    target_name: string
    object_type: string
    object_name: string
    metric: string
    value: number
    ts: number
  }>

  const alertCounts = db
    .prepare(
      `SELECT severity, status, COUNT(*) AS count
       FROM ops_alerts
       WHERE status <> 'resolved'
       GROUP BY severity, status`,
    )
    .all() as Array<{ severity: string; status: string; count: number }>

  const lines: string[] = [
    "# HELP hainmq_metric Latest HainMQ operations sample",
    "# TYPE hainmq_metric gauge",
  ]

  for (const row of rows) {
    lines.push(
      `hainmq_metric{${labels({
        target: row.target_name,
        object_type: row.object_type,
        object_name: row.object_name,
        metric: row.metric,
      })}} ${Number(row.value)}`,
    )

    if (row.metric === "queue.messages") {
      lines.push(
        `hainmq_queue_messages{${labels({ target: row.target_name, queue: row.object_name })}} ${Number(row.value)}`,
      )
    } else if (row.metric === "queue.messages_ready") {
      lines.push(
        `hainmq_queue_ready{${labels({ target: row.target_name, queue: row.object_name })}} ${Number(row.value)}`,
      )
    } else if (row.metric === "queue.messages_unacked") {
      lines.push(
        `hainmq_queue_unacked{${labels({ target: row.target_name, queue: row.object_name })}} ${Number(row.value)}`,
      )
    } else if (row.metric === "service.reachable") {
      lines.push(
        `hainmq_target_up{${labels({ target: row.target_name })}} ${Number(row.value)}`,
      )
    } else if (row.metric === "node.mem_alarm") {
      lines.push(
        `hainmq_node_memory_alarm{${labels({ target: row.target_name })}} ${Number(row.value)}`,
      )
    } else if (row.metric === "node.disk_alarm") {
      lines.push(
        `hainmq_node_disk_alarm{${labels({ target: row.target_name })}} ${Number(row.value)}`,
      )
    }
  }

  lines.push("# HELP hainmq_alert_active Active operations alerts", "# TYPE hainmq_alert_active gauge")
  for (const alert of alertCounts) {
    lines.push(
      `hainmq_alert_active{${labels({ severity: alert.severity, status: alert.status })}} ${Number(alert.count)}`,
    )
  }

  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  })
}
