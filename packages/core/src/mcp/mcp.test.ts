import { describe, expect, it } from 'vitest'
import {
  encode,
  handleRequest,
  type JsonRpcRequest,
  PROTOCOL_VERSION,
  RPC,
  readMessages,
  type ServerOptions,
  textResult,
} from './protocol.js'
import { MCP_TOOL_NAMES, MCP_TOOLS } from './tools.js'

const options: ServerOptions = {
  info: { name: 'delphi-team', version: '0.1.0' },
  tools: MCP_TOOLS,
  call: async (name, args) => textResult(`${name}:${JSON.stringify(args)}`),
}

const request = (
  method: string,
  params?: Record<string, unknown>,
  id: number | null = 1,
): JsonRpcRequest => ({
  jsonrpc: '2.0',
  ...(id === null ? {} : { id }),
  method,
  ...(params ? { params } : {}),
})

describe('the handshake', () => {
  it('answers initialize with a version, capabilities and who it is', async () => {
    const response = await handleRequest(request('initialize'), options)
    const result = response?.result as Record<string, unknown>
    expect(result.protocolVersion).toBe(PROTOCOL_VERSION)
    expect(result.serverInfo).toEqual({ name: 'delphi-team', version: '0.1.0' })
    expect((result.capabilities as Record<string, unknown>).tools).toBeDefined()
  })

  it('says nothing to a notification', async () => {
    // Answering a notification is a protocol error, not a harmless extra.
    expect(await handleRequest(request('notifications/initialized', undefined, null), options)).toBeNull()
  })

  it('answers ping, so a client can check the connection', async () => {
    expect((await handleRequest(request('ping'), options))?.result).toEqual({})
  })
})

describe('tools', () => {
  it('lists every tool with a schema', async () => {
    const response = await handleRequest(request('tools/list'), options)
    const tools = (response?.result as { tools: typeof MCP_TOOLS } | undefined)?.tools ?? []
    expect(tools.map((t) => t.name)).toEqual(MCP_TOOL_NAMES)
    for (const tool of tools) {
      expect(tool.inputSchema.type, tool.name).toBe('object')
      expect(tool.description.length, tool.name).toBeGreaterThan(30)
    }
  })

  it('calls a tool and returns its text', async () => {
    const response = await handleRequest(
      request('tools/call', { name: 'state_read', arguments: {} }),
      options,
    )
    const result = response?.result as { content: Array<{ text: string }> }
    expect(result.content[0]?.text).toContain('state_read')
  })

  it('refuses a tool it does not have', async () => {
    const response = await handleRequest(request('tools/call', { name: 'rm_rf' }), options)
    expect(response?.error?.code).toBe(RPC.methodNotFound)
  })

  it('refuses a call with no tool name', async () => {
    const response = await handleRequest(request('tools/call', {}), options)
    expect(response?.error?.code).toBe(RPC.invalidParams)
  })

  it('turns a failing tool into a result, not a broken connection', async () => {
    // The caller should see the message and carry on. A protocol error would drop the
    // connection and take every other seat call with it.
    const failing: ServerOptions = {
      ...options,
      call: async () => {
        throw new Error('the board refused that move')
      },
    }
    const response = await handleRequest(request('tools/call', { name: 'task_update' }), failing)
    expect(response?.error).toBeUndefined()
    const result = response?.result as { content: Array<{ text: string }>; isError: boolean }
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toBe('the board refused that move')
  })

  it('exposes nothing that needs a human', async () => {
    // A seat coordinating itself is the point. A seat dispatching other seats, changing
    // permissions, or writing outside the ledger is not.
    for (const name of MCP_TOOL_NAMES) {
      expect(name, name).not.toMatch(/dispatch|spawn|permission|exec|shell|delete/i)
    }
  })
})

describe('malformed input', () => {
  it('rejects a message that is not JSON-RPC 2.0', async () => {
    const response = await handleRequest({ ...request('tools/list'), jsonrpc: '1.0' as never }, options)
    expect(response?.error?.code).toBe(RPC.invalidRequest)
  })

  it('rejects an unknown method rather than ignoring it', async () => {
    expect((await handleRequest(request('tools/delete'), options))?.error?.code).toBe(RPC.methodNotFound)
  })
})

describe('reading the stream', () => {
  it('splits newline-delimited messages', () => {
    const { messages, rest } = readMessages(
      '{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0","id":2,"method":"ping"}\n',
    )
    expect(messages).toHaveLength(2)
    expect(rest).toBe('')
  })

  it('keeps a half-arrived message for the next chunk', () => {
    // A chunk can cut a message in half, and dropping the remainder loses a call.
    const first = readMessages('{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc":"2.0",')
    expect(first.messages).toHaveLength(1)
    expect(first.rest).toBe('{"jsonrpc":"2.0",')

    const second = readMessages(`${first.rest}"id":2,"method":"ping"}\n`)
    expect(second.messages).toHaveLength(1)
    expect(second.messages[0]?.id).toBe(2)
  })

  it('collects a broken line instead of throwing the whole chunk away', () => {
    const { messages, malformed } = readMessages('not json\n{"jsonrpc":"2.0","id":1,"method":"ping"}\n')
    expect(malformed).toEqual(['not json'])
    expect(messages).toHaveLength(1)
  })

  it('ignores blank lines', () => {
    expect(readMessages('\n\n').messages).toEqual([])
  })

  it('encodes one message per line', () => {
    const line = encode({ jsonrpc: '2.0', id: 1, result: {} })
    expect(line.endsWith('\n')).toBe(true)
    expect(line.trimEnd().includes('\n')).toBe(false)
  })
})
