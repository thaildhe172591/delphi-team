/**
 * A minimal Model Context Protocol server, over stdio.
 *
 * Hand-written rather than pulled from the SDK, which is 4.3 MB unpacked against a CLI
 * that is currently about a hundred kilobytes — for a feature most users will never turn
 * on, and which needs exactly three methods. The protocol surface here is `initialize`,
 * `tools/list` and `tools/call`, carried as newline-delimited JSON-RPC 2.0.
 *
 * The trade is real and worth naming: we own protocol correctness. That is why the shapes
 * below are tested against recorded exchanges, and why `delphi mcp` is verified by talking
 * to it rather than by assuming. If the surface ever grows past this, take the SDK.
 */

export const PROTOCOL_VERSION = '2025-06-18'

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/** JSON-RPC error codes, as the specification defines them. */
export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/** What a tool returns. `isError` tells the caller it failed without failing the protocol. */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) }
}

export interface ServerInfo {
  name: string
  version: string
}

export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolResult>

export interface ServerOptions {
  info: ServerInfo
  tools: ToolDefinition[]
  call: (name: string, args: Record<string, unknown>) => Promise<ToolResult>
}

/**
 * Handle one request.
 *
 * Returns null for a notification, which by the specification gets no response at all —
 * answering one is a protocol error, not a harmless extra.
 */
export async function handleRequest(
  request: JsonRpcRequest,
  options: ServerOptions,
): Promise<JsonRpcResponse | null> {
  const isNotification = request.id === undefined || request.id === null
  const id = request.id ?? null

  if (request.jsonrpc !== '2.0') {
    return isNotification ? null : error(id, RPC.invalidRequest, 'jsonrpc must be "2.0"')
  }

  switch (request.method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: options.info,
      })

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null

    case 'ping':
      return ok(id, {})

    case 'tools/list':
      return ok(id, { tools: options.tools })

    case 'tools/call': {
      const name = request.params?.name
      if (typeof name !== 'string') {
        return error(id, RPC.invalidParams, 'tools/call needs a tool name')
      }
      if (!options.tools.some((tool) => tool.name === name)) {
        return error(id, RPC.methodNotFound, `no tool called ${name}`)
      }
      const args = (request.params?.arguments ?? {}) as Record<string, unknown>
      try {
        return ok(id, await options.call(name, args))
      } catch (thrown) {
        // A tool that fails is a tool result, not a protocol error: the caller should see
        // the message and carry on, rather than the connection breaking.
        const message = thrown instanceof Error ? thrown.message : String(thrown)
        return ok(id, textResult(message, true))
      }
    }

    default:
      return isNotification ? null : error(id, RPC.methodNotFound, `unknown method ${request.method}`)
  }
}

function ok(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

function error(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

/**
 * Split a stream of newline-delimited JSON into messages.
 *
 * Returns what could be parsed and whatever is left over, because a chunk can arrive with
 * a message cut in half and dropping the remainder loses a call.
 */
export function readMessages(buffer: string): {
  messages: JsonRpcRequest[]
  malformed: string[]
  rest: string
} {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const messages: JsonRpcRequest[] = []
  const malformed: string[] = []

  for (const line of lines) {
    if (line.trim() === '') continue
    try {
      messages.push(JSON.parse(line) as JsonRpcRequest)
    } catch {
      malformed.push(line)
    }
  }
  return { messages, malformed, rest }
}

export function encode(response: JsonRpcResponse): string {
  return `${JSON.stringify(response)}\n`
}
