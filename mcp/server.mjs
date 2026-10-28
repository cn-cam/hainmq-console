#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"

const baseUrl = (process.env.OPS_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/, "")
const token = process.env.OPS_MCP_TOKEN

if (!token) {
  console.error("OPS_MCP_TOKEN is required")
  process.exit(1)
}

const tools = JSON.parse(
  readFileSync(new URL("../lib/ops/mcp-tools.json", import.meta.url), "utf8"),
)

const server = new Server(
  { name: "rabbitscout-ops", version: "1.0.0" },
  { capabilities: { tools: {} } },
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      readOnlyHint: !tool.write,
      destructiveHint: Boolean(tool.write),
    },
  })),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  try {
    const response = await fetch(`${baseUrl}/api/ops/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tool: name, arguments: args || {} }),
    })

    const data = await response.json()
    if (!response.ok || !data.ok) {
      return {
        content: [{ type: "text", text: `Error: ${data.error || response.statusText}` }],
        isError: true,
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data.result, null, 2) }],
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `RabbitScout Ops MCP error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
