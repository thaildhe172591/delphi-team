import { z } from 'zod'
import { SeatIdSchema } from './common.js'

/** Task states and the moves allowed between them (MEMORY_SPEC section 3.4). */
export const TaskStatusSchema = z.enum([
  'backlog',
  'ready',
  'doing',
  'review',
  'done',
  'blocked',
  'cancelled',
])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

/**
 * Legal moves. `blocked` is reachable from any live state and returns to where work
 * resumes; `cancelled` is reachable from anywhere and is terminal. `done` is terminal
 * too — a task that needs more work is reopened as a new task, so the journal keeps an
 * honest history instead of a status that silently went backwards.
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  backlog: ['ready', 'blocked', 'cancelled'],
  ready: ['doing', 'backlog', 'blocked', 'cancelled'],
  doing: ['review', 'ready', 'blocked', 'cancelled'],
  review: ['done', 'doing', 'blocked', 'cancelled'],
  done: [],
  blocked: ['ready', 'doing', 'review', 'cancelled'],
  cancelled: [],
}

export const StoryTypeSchema = z.enum(['feature', 'bug', 'spike', 'chore'])

/**
 * A story is the handover package for one piece of work (MEMORY_SPEC section 3.3).
 * Every field here exists so a fresh session can pick the work up with no conversation
 * history: what to change, what is out of bounds, what "done" means, and how to prove it.
 */
export const StorySchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[A-Z]+-\d+$/, 'looks like T-012 or D-007'),
  title: z.string().min(1),
  type: StoryTypeSchema,
  owner: SeatIdSchema,
  status: TaskStatusSchema,
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  depends_on: z.array(z.string()).default([]),
  /** Globs this story may touch. Anything outside belongs to another seat. */
  files: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  /** Checkable statements. A story cannot reach `ready` without at least one. */
  acceptance: z.array(z.string()).default([]),
  /** The command that proves it works. Pasted with its output into the report. */
  verify: z.string().optional(),
  attachments: z.array(z.string()).default([]),
  report_to: SeatIdSchema.default('orchestrator'),
  handoff_to: SeatIdSchema.optional(),
  created: z.string().min(1),
  updated: z.string().min(1),
})
export type Story = z.infer<typeof StorySchema>

/** One row of `board.yaml` — the index; the story file holds the detail. */
export const BoardEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: TaskStatusSchema,
  owner: SeatIdSchema,
  type: StoryTypeSchema.default('feature'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  depends_on: z.array(z.string()).default([]),
  updated: z.string().min(1),
  /** Why it is blocked. Required when status is `blocked`, so the board never just stalls. */
  blocked_reason: z.string().optional(),
})
export type BoardEntry = z.infer<typeof BoardEntrySchema>

export const BoardSchema = z.object({
  version: z.literal(1).default(1),
  tasks: z.array(BoardEntrySchema).default([]),
})
export type Board = z.infer<typeof BoardSchema>

/** The index of projects in `.delphi/index.yaml`. */
export const ProjectIndexSchema = z.object({
  version: z.literal(1).default(1),
  projects: z
    .array(
      z.object({
        slug: z
          .string()
          .min(1)
          .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be lowercase and hyphenated'),
        title: z.string().min(1),
        status: z.enum(['open', 'closed']).default('open'),
        updated: z.string().min(1),
      }),
    )
    .default([]),
})
export type ProjectIndex = z.infer<typeof ProjectIndexSchema>
