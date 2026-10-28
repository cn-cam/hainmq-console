import { decryptSecret } from "./crypto"
import { executeOpsTool, MCP_TOOLS } from "./mcp"
import type { ModelProfile } from "./types"

export interface ChatTurn {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  tool_call_id?: string
  tool_calls?: OpenAiToolCall[]
}

interface OpenAiToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

interface OpenAiResponse {
  choices?: Array<{
    message?: {
      role?: string
      content?: string | null
      tool_calls?: OpenAiToolCall[]
    }
  }>
  error?: { message?: string }
}

function endpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "")
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

export function modelToolDefinitions() {
  return MCP_TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }))
}

async function callModel(
  profile: ModelProfile,
  messages: ChatTurn[],
  tools: ReturnType<typeof modelToolDefinitions>,
): Promise<OpenAiResponse> {
  const apiKey = profile.apiKeyEnc ? decryptSecret(profile.apiKeyEnc) : ""
  const response = await fetch(endpoint(profile.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: profile.model,
      messages,
      temperature: profile.temperature,
      max_tokens: profile.maxTokens,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
    }),
    signal: AbortSignal.timeout(Number(process.env.OPS_MODEL_TIMEOUT_MS || 120000)),
  })

  const text = await response.text()
  let data: OpenAiResponse
  try {
    data = JSON.parse(text) as OpenAiResponse
  } catch {
    throw new Error(`Model returned non-JSON response (${response.status})`)
  }
  if (!response.ok) {
    throw new Error(data.error?.message || `Model request failed (${response.status})`)
  }
  return data
}

export interface ChatResult {
  content: string
  toolCalls: Array<{ name: string; arguments: unknown; result: unknown }>
}

export async function runChat(
  profile: ModelProfile,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  actor: string,
): Promise<ChatResult> {
  const tools = modelToolDefinitions()
  const messages: ChatTurn[] = [
    {
      role: "system",
      content:
        profile.systemPrompt ||
        "You are a RabbitMQ operations assistant. Use the provided tools to inspect the broker. Never invent metrics. Write operations require human approval and must be requested through the tools.",
    },
    ...history,
  ]

  const used: ChatResult["toolCalls"] = []

  for (let round = 0; round < 4; round += 1) {
    const response = await callModel(profile, messages, tools)
    const message = response.choices?.[0]?.message
    if (!message) throw new Error("Model returned no message")
    const content = message.content || ""

    if (!message.tool_calls?.length) {
      return { content, toolCalls: used }
    }

    messages.push({
      role: "assistant",
      content,
      tool_calls: message.tool_calls,
    })

    for (const call of message.tool_calls) {
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>
      } catch {
        args = {}
      }

      let result: unknown
      try {
        result = await executeOpsTool(call.function.name, args, actor)
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : String(error),
        }
      }
      used.push({ name: call.function.name, arguments: args, result })
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 12000),
      })
    }
  }

  return {
    content:
      "工具调用次数已达到上限。请缩小问题范围，或在运维页面查看已生成的审批与告警。",
    toolCalls: used,
  }
}

export async function testModelProfile(profile: ModelProfile): Promise<string> {
  const response = await callModel(
    profile,
    [
      { role: "user", content: "Reply with the single word: OK" },
    ],
    [],
  )
  return response.choices?.[0]?.message?.content?.trim() || "OK"
}
