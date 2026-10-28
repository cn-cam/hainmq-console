import { insertAuditLog, now } from "./db"
import { rabbitmqRequestWithCredentials } from "./rabbitmq"
import { getApproval, getTarget, updateApproval } from "./store"
import type { AuthSession } from "@/lib/rabbitmq/types"
import type { OpsUser } from "./types"

function enc(value: string): string {
  return encodeURIComponent(value)
}

export async function approveAndExecute(
  approvalId: string,
  user: OpsUser & { session: AuthSession },
) {
  const approval = getApproval(approvalId)
  if (!approval) throw new Error("Approval not found")
  if (approval.status !== "pending") throw new Error(`Approval is already ${approval.status}`)
  if (approval.expiresAt < now()) {
    updateApproval(approvalId, "expired", user.username, "Expired before approval")
    throw new Error("Approval has expired")
  }

  const target = getTarget(approval.targetId)
  if (!target) throw new Error("Target not found")

  const payload = approval.payload
  const vhost = approval.vhost || String(payload.vhost || "/")
  let method = "POST"
  let path = ""
  let body: unknown

  switch (approval.action) {
    case "mq_create_queue":
      method = "PUT"
      path = `/api/queues/${enc(vhost)}/${enc(String(payload.name))}`
      body = {
        durable: payload.durable ?? true,
        auto_delete: payload.auto_delete ?? false,
        arguments: payload.arguments ?? {},
      }
      break
    case "mq_delete_queue":
      method = "DELETE"
      path = `/api/queues/${enc(vhost)}/${enc(String(payload.name))}`
      break
    case "mq_purge_queue":
      method = "DELETE"
      path = `/api/queues/${enc(vhost)}/${enc(String(payload.name))}/contents`
      break
    case "mq_publish_message":
      method = "POST"
      path = `/api/exchanges/${enc(vhost)}/${enc(String(payload.exchange || "amq.default"))}/publish`
      body = {
        routing_key: payload.routing_key,
        payload: payload.payload,
        payload_encoding: payload.payload_encoding ?? "string",
        properties: payload.properties ?? {},
      }
      break
    case "mq_create_binding":
      method = "POST"
      path = `/api/bindings/${enc(vhost)}/e/${enc(String(payload.exchange))}/q/${enc(String(payload.queue))}`
      body = {
        routing_key: payload.routing_key ?? "",
        arguments: payload.arguments ?? {},
      }
      break
    case "mq_delete_binding":
      method = "DELETE"
      path = `/api/bindings/${enc(vhost)}/e/${enc(String(payload.exchange))}/q/${enc(String(payload.queue))}/${enc(String(payload.properties_key))}`
      break
    case "mq_close_connection":
      method = "DELETE"
      path = `/api/connections/${enc(String(payload.name))}`
      break
    default:
      throw new Error(`Unsupported approval action: ${approval.action}`)
  }

  try {
    const result = await rabbitmqRequestWithCredentials(
      target,
      user.session.credentials,
      method,
      path,
      body,
    )

    const text = JSON.stringify(result.data)
    updateApproval(
      approvalId,
      result.ok ? "executed" : "failed",
      user.username,
      text.slice(0, 4000),
    )
    insertAuditLog({
      actor: user.username,
      action: `approval.${approval.action}`,
      target: approval.id,
      details: { payload: approval.payload, targetId: approval.targetId },
      result: result.ok ? "success" : `HTTP ${result.status}`,
    })

    if (!result.ok) {
      throw new Error(`RabbitMQ returned ${result.status}: ${text.slice(0, 500)}`)
    }
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    updateApproval(approvalId, "failed", user.username, message.slice(0, 4000))
    insertAuditLog({
      actor: user.username,
      action: `approval.${approval.action}`,
      target: approval.id,
      details: { payload: approval.payload, targetId: approval.targetId },
      result: message.slice(0, 1000),
    })
    throw error
  }
}

export function rejectApproval(approvalId: string, user: OpsUser, reason?: string) {
  const approval = getApproval(approvalId)
  if (!approval) throw new Error("Approval not found")
  if (approval.status !== "pending") throw new Error(`Approval is already ${approval.status}`)
  updateApproval(approvalId, "rejected", user.username, reason || "Rejected")
  insertAuditLog({
    actor: user.username,
    action: `approval.reject`,
    target: approval.id,
    details: { action: approval.action, payload: approval.payload },
    result: reason || "rejected",
  })
  return getApproval(approvalId)
}
