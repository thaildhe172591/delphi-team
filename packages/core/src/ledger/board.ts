import type { Board, BoardEntry, TaskStatus } from '../schema/work.js'
import { BoardSchema, TASK_TRANSITIONS } from '../schema/work.js'
import { isoNow } from './journal.js'
import { readYaml, updateYaml } from './store.js'

export class BoardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoardError'
  }
}

const EMPTY: Board = { version: 1, tasks: [] }

export async function readBoard(path: string): Promise<Board> {
  return readYaml(path, BoardSchema, EMPTY)
}

/**
 * Is this move legal, and does the task carry what the target state requires?
 *
 * The rules are the ones in MEMORY_SPEC section 3.4, and they exist to stop the board
 * lying: `ready` without acceptance criteria is a task nobody can finish, `done` without
 * evidence is a claim rather than a result, and `blocked` without a reason tells the
 * orchestrator nothing it can act on.
 */
export function checkTransition(
  entry: BoardEntry,
  to: TaskStatus,
  evidence: { acceptance?: string[]; files?: string[]; hasReport?: boolean; reason?: string } = {},
): { ok: true } | { ok: false; reason: string } {
  const from = entry.status
  if (from === to) return { ok: false, reason: `${entry.id} is already ${to}` }

  const allowed = TASK_TRANSITIONS[from]
  if (!allowed.includes(to)) {
    const options = allowed.length > 0 ? allowed.join(', ') : 'nothing (it is a final state)'
    return {
      ok: false,
      reason: `${entry.id} cannot go ${from} -> ${to}; from ${from} it can go to ${options}`,
    }
  }

  if (to === 'ready') {
    if (!evidence.acceptance?.length) {
      return { ok: false, reason: `${entry.id} needs at least one acceptance criterion before it is ready` }
    }
    if (!evidence.files?.length) {
      return { ok: false, reason: `${entry.id} needs an owned file list before it is ready` }
    }
  }

  if (to === 'done' && !evidence.hasReport) {
    return { ok: false, reason: `${entry.id} needs a report with evidence before it can be done` }
  }

  if (to === 'blocked' && !evidence.reason?.trim()) {
    return { ok: false, reason: `${entry.id} needs a reason when it is blocked` }
  }

  return { ok: true }
}

export interface MoveOptions {
  acceptance?: string[]
  files?: string[]
  hasReport?: boolean
  reason?: string
  now?: string
}

/** Move a task, refusing anything `checkTransition` rejects. Read and write share one lock. */
export async function moveTask(
  path: string,
  id: string,
  to: TaskStatus,
  options: MoveOptions = {},
): Promise<BoardEntry> {
  let moved: BoardEntry | undefined
  await updateYaml(path, BoardSchema, EMPTY, (board) => {
    const entry = board.tasks.find((task) => task.id === id)
    if (!entry) throw new BoardError(`no task ${id} on this board`)

    const check = checkTransition(entry, to, options)
    if (!check.ok) throw new BoardError(check.reason)

    const next: BoardEntry = {
      ...entry,
      status: to,
      updated: options.now ?? isoNow(),
      ...(to === 'blocked' ? { blocked_reason: options.reason } : {}),
    }
    // A reason belongs to the block, not to the task for ever after.
    if (to !== 'blocked') delete next.blocked_reason

    moved = next
    return { ...board, tasks: board.tasks.map((task) => (task.id === id ? next : task)) }
  })

  if (!moved) throw new BoardError(`${id} was not moved; the board was not updated`)
  return moved
}

export async function addTask(path: string, entry: BoardEntry): Promise<BoardEntry> {
  await updateYaml(path, BoardSchema, EMPTY, (board) => {
    if (board.tasks.some((task) => task.id === entry.id)) {
      throw new BoardError(`task ${entry.id} already exists`)
    }
    return { ...board, tasks: [...board.tasks, entry] }
  })
  return entry
}

/** Tasks that are neither done nor cancelled — what a new orchestrator actually needs. */
export function openTasks(board: Board): BoardEntry[] {
  return board.tasks.filter((task) => task.status !== 'done' && task.status !== 'cancelled')
}

/**
 * Tasks whose dependencies are all done — what can actually be started now.
 * A dependency that is not on the board counts as unmet rather than as satisfied, because
 * the alternative is dispatching work whose input does not exist.
 */
export function readyToStart(board: Board): BoardEntry[] {
  const done = new Set(board.tasks.filter((t) => t.status === 'done').map((t) => t.id))
  return board.tasks.filter((task) => task.status === 'ready' && task.depends_on.every((id) => done.has(id)))
}
