import type { ToolDefinition } from './protocol.js'

/**
 * The tools a seat can call instead of typing shell commands.
 *
 * The point of this server is not convenience. A seat driving the ledger through Bash has
 * to get a command line right, and when it gets it wrong the failure is a shell error the
 * model then has to interpret. A tool call either matches its schema or does not.
 *
 * The set is deliberately small, and deliberately excludes everything that needs a human:
 * no dispatching, no permission changes, no writes outside the ledger. A seat coordinating
 * itself is the point; a seat starting other seats is not.
 */

const seat = { type: 'string', description: 'seat id, e.g. dev-be' }
const project = { type: 'string', description: 'project slug; omitted when only one is open' }

export const MCP_TOOLS: ToolDefinition[] = [
  {
    name: 'task_list',
    description:
      'The board. Use it to see what is assigned, what is ready to start, and what is blocked, ' +
      'rather than assuming from the conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        project,
        seat: { ...seat, description: 'only this seat tasks' },
        open_only: { type: 'boolean', description: 'exclude done and cancelled' },
      },
    },
  },
  {
    name: 'task_show',
    description: 'One task and its story: what to change, what done means, and how to prove it.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'task id, e.g. T-012' }, project },
      required: ['id'],
    },
  },
  {
    name: 'task_claim',
    description:
      'Take a ready task and move it to doing. Refused if the task is not ready or is owned by ' +
      'someone else, which is what stops two seats working the same thing.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, seat, project },
      required: ['id', 'seat'],
    },
  },
  {
    name: 'task_update',
    description:
      'Move a task. The board refuses an illegal move: ready needs acceptance criteria, done needs a ' +
      'report with evidence, blocked needs a reason.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: {
          type: 'string',
          description: 'backlog | ready | doing | review | done | blocked | cancelled',
        },
        reason: { type: 'string', description: 'required when blocking' },
        project,
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'state_read',
    description: 'The current snapshot of the project: goal, phase, what is in flight, what is blocked.',
    inputSchema: { type: 'object', properties: { project } },
  },
  {
    name: 'journal_append',
    description: 'Record an event. Write it when it happens, not at the end of the shift.',
    inputSchema: {
      type: 'object',
      properties: {
        event: { type: 'string', description: 'what happened, in a few words' },
        id: { type: 'string', description: 'task or decision id' },
        seat,
        detail: { type: 'string', description: 'a path or a short note' },
        project,
      },
      required: ['event', 'seat'],
    },
  },
  {
    name: 'handoff_create',
    description:
      'Pass work to another seat, with the part that is not in any file: the hypothesis you were ' +
      'following, what you ruled out, what looked wrong but you did not chase.',
    inputSchema: {
      type: 'object',
      properties: {
        from: seat,
        to: seat,
        task: { type: 'string' },
        note: { type: 'string', description: 'what is not written down anywhere else' },
        project,
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'handoff_ack',
    description: 'Mark the messages in your inbox as read, once you have actually read them.',
    inputSchema: { type: 'object', properties: { seat, project }, required: ['seat'] },
  },
]

/** Tool names, for the places that need to check one exists. */
export const MCP_TOOL_NAMES = MCP_TOOLS.map((tool) => tool.name)
