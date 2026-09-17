import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  appendJournal,
  BoardSchema,
  encode,
  handleRequest,
  isoNow,
  MCP_TOOLS,
  moveTask,
  openTasks,
  readMessages,
  readOr,
  readYaml,
  readyToStart,
  type ServerOptions,
  type TaskStatus,
  TaskStatusSchema,
  type ToolResult,
  textResult,
} from '@delphi-team/core'
import { Command } from 'commander'
import matter from 'gray-matter'
import { type Context, requireInitialised, resolveProject, UserError } from '../context.js'

/**
 * Let a seat drive the ledger through tool calls instead of shell commands.
 *
 * A seat using Bash has to get a command line right, and when it gets it wrong the result
 * is a shell error it then has to interpret. A tool call either matches its schema or is
 * refused with a reason. Same core, same file locks, same refusals — different door.
 *
 * Nothing here is written to stdout except protocol messages: stdout *is* the transport,
 * so a stray log line would corrupt the stream. Diagnostics go to stderr.
 */
export function mcpCommand(): Command {
  return new Command('mcp').description('run the delphi MCP server on stdin and stdout').action(async () => {
    const context = await requireInitialised()

    const options: ServerOptions = {
      info: { name: 'delphi-team', version: __DELPHI_VERSION__ },
      tools: MCP_TOOLS,
      call: (name, args) => callTool(context, name, args),
    }

    process.stderr.write(`delphi mcp: serving ${MCP_TOOLS.length} tools from ${context.root}\n`)

    let buffer = ''
    for await (const chunk of process.stdin) {
      buffer += String(chunk)
      const { messages, malformed, rest } = readMessages(buffer)
      buffer = rest

      for (const line of malformed) {
        process.stderr.write(`delphi mcp: ignoring a line that is not JSON: ${line.slice(0, 120)}\n`)
      }
      for (const message of messages) {
        const response = await handleRequest(message, options)
        if (response) process.stdout.write(encode(response))
      }
    }
  })
}

async function callTool(context: Context, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const slug = await resolveProject(context, str(args.project))
  const paths = context.paths.project(slug)

  switch (name) {
    case 'task_list': {
      const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })
      let tasks = args.open_only ? openTasks(board) : board.tasks
      const seat = str(args.seat)
      if (seat) tasks = tasks.filter((task) => task.owner === seat)
      const startable = new Set(readyToStart(board).map((t) => t.id))

      return textResult(
        JSON.stringify(
          {
            project: slug,
            tasks: tasks.map((task) => ({ ...task, canStartNow: startable.has(task.id) })),
          },
          null,
          2,
        ),
      )
    }

    case 'task_show': {
      const id = required(args.id, 'id')
      const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })
      const entry = board.tasks.find((task) => task.id === id)
      if (!entry) return textResult(`There is no task ${id} on this board.`, true)
      const story = await readOr(paths.story(id), '')
      return textResult(
        JSON.stringify(
          { ...entry, story: story || null, storyPath: story ? paths.story(id) : null },
          null,
          2,
        ),
      )
    }

    case 'task_claim': {
      const id = required(args.id, 'id')
      const seat = required(args.seat, 'seat')
      const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })
      const entry = board.tasks.find((task) => task.id === id)

      if (!entry) return textResult(`There is no task ${id} on this board.`, true)
      // Claiming someone else's work is exactly the collision the board exists to prevent.
      if (entry.owner !== seat) {
        return textResult(
          `${id} belongs to ${entry.owner}, not to ${seat}. Ask the orchestrator to reassign it rather than taking it.`,
          true,
        )
      }
      if (entry.status !== 'ready') {
        return textResult(`${id} is ${entry.status}, not ready. Only a ready task can be claimed.`, true)
      }

      const moved = await moveTask(paths.board, id, 'doing')
      await appendJournal(paths.journal, { id, seat, event: 'claimed' })
      return textResult(JSON.stringify(moved, null, 2))
    }

    case 'task_update': {
      const id = required(args.id, 'id')
      const status = TaskStatusSchema.safeParse(args.status)
      if (!status.success) {
        return textResult(
          `"${String(args.status)}" is not a status. Use one of: ${TaskStatusSchema.options.join(', ')}.`,
          true,
        )
      }

      const story = await readOr(paths.story(id), '')
      const front = story ? (matter(story).data as Record<string, unknown>) : {}
      const reason = str(args.reason)

      const moved = await moveTask(paths.board, id, status.data as TaskStatus, {
        acceptance: list(front.acceptance),
        files: list(front.files),
        hasReport: await hasReport(paths.reportsFor(str(front.owner) ?? 'unknown'), id),
        ...(reason ? { reason } : {}),
      })
      await appendJournal(paths.journal, {
        id,
        seat: moved.owner,
        event: `status -> ${moved.status}`,
        ...(reason ? { detail: reason } : {}),
      })
      return textResult(JSON.stringify(moved, null, 2))
    }

    case 'state_read':
      return textResult(await readOr(paths.state, '(no STATE.md yet)'))

    case 'journal_append': {
      const event = required(args.event, 'event')
      const seat = required(args.seat, 'seat')
      const detail = str(args.detail)
      await appendJournal(paths.journal, {
        id: str(args.id) ?? '-',
        seat,
        event,
        ...(detail ? { detail } : {}),
      })
      return textResult('Recorded.')
    }

    case 'handoff_create': {
      const from = required(args.from, 'from')
      const to = required(args.to, 'to')
      const task = str(args.task)
      const note = str(args.note)

      const now = isoNow()
      const stamp = now.replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
      const file = join(paths.handoffs, `${stamp}-${from}-${to}.md`)

      await mkdir(paths.handoffs, { recursive: true })
      await writeFile(
        file,
        [
          `# Handoff — ${from} to ${to}          ${now}`,
          '',
          '## Task',
          task ?? '(none given)',
          '',
          '## What is not written down anywhere else',
          note ?? '(nothing added — the next seat gets only what is in the ledger)',
          '',
        ].join('\n'),
        'utf8',
      )

      const inbox = paths.inbox(to)
      await mkdir(inbox, { recursive: true })
      await writeFile(
        join(inbox, `${stamp}-handoff.md`),
        [
          '---',
          'status: unread',
          `from: ${from}`,
          `created: ${now}`,
          '---',
          '',
          `${from} handed you ${task ?? 'work'}.`,
          `Read: handoffs/${stamp}-${from}-${to}.md`,
          '',
        ].join('\n'),
        'utf8',
      )
      await appendJournal(paths.journal, { id: task ?? '-', seat: from, event: `handoff to ${to}` })

      return textResult(
        note
          ? `Handed over, with your note.`
          : `Handed over. You left no note, so ${to} gets only what is in the ledger.`,
      )
    }

    case 'handoff_ack': {
      const seat = required(args.seat, 'seat')
      const dir = paths.inbox(seat)
      let marked = 0
      try {
        for (const file of await readdir(dir)) {
          const path = join(dir, file)
          const body = await readFile(path, 'utf8')
          if (!body.includes('status: unread')) continue
          await writeFile(path, body.replace('status: unread', 'status: read'), 'utf8')
          marked++
        }
      } catch {
        // No inbox is the same as an empty one.
      }
      return textResult(marked === 0 ? 'Nothing was unread.' : `Marked ${marked} as read.`)
    }

    default:
      return textResult(`No tool called ${name}.`, true)
  }
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function required(value: unknown, name: string): string {
  const found = str(value)
  if (!found) throw new UserError(`${name} is required`)
  return found
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : []
}

async function hasReport(dir: string, id: string): Promise<boolean> {
  try {
    return (await readdir(dir)).some((file) => file.startsWith(`${id}-`))
  } catch {
    return false
  }
}
