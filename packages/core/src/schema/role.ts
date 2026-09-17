import { z } from 'zod'
import { EffortSchema, ModelSchema, SeatIdSchema } from './common.js'

/**
 * Frontmatter of a generated `.claude/agents/<seat>.md` (ROLES_SPEC section 1).
 *
 * Phase 0 established that a teammate only receives `tools`, `model` and the body —
 * `skills` never applies, `mcpServers` only in split-pane mode, and `effort`, `memory`,
 * `hooks` and `disallowedTools` are not documented as applying at all. So these fields
 * are written for the `claude --agent` and subagent cases, and every mandatory procedure
 * is duplicated into the body where it always arrives.
 */
export const RoleFrontmatterSchema = z.object({
  name: SeatIdSchema,
  /** Kept short: Claude Code trims skill and agent descriptions to a token budget. */
  description: z.string().min(1).max(500),
  model: ModelSchema.optional(),
  effort: EffortSchema.optional(),
  memory: z.enum(['project', 'user', 'local']).optional(),
  color: z.string().optional(),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
  disallowedTools: z.union([z.string(), z.array(z.string())]).optional(),
})
export type RoleFrontmatter = z.infer<typeof RoleFrontmatterSchema>

/** Capability pack frontmatter (CUSTOMIZATION_SPEC section 2). */
export const CapabilitySchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be lowercase and hyphenated'),
  title: z.string().min(1),
  version: z.number().int().min(1).default(1),
  /** Base roles this may be merged into; `"*"` means any. */
  applies_to: z.array(z.string().min(1)).default(['*']),
  requires: z
    .object({
      tools: z.array(z.string()).default([]),
      /** Must be configured in project or user settings: a teammate may not inherit these. */
      mcp_servers: z.array(z.string()).default([]),
      skills: z.array(z.string()).default([]),
      commands: z.array(z.string()).default([]),
    })
    .prefault({}),
  /** Suggested only. Never written to settings without `--apply-permissions`. */
  permissions: z
    .object({
      allow: z.array(z.string()).default([]),
      deny: z.array(z.string()).default([]),
    })
    .prefault({}),
  risk: z.enum(['low', 'medium', 'high']).default('low'),
  conflicts_with: z.array(z.string()).default([]),
})
export type Capability = z.infer<typeof CapabilitySchema>

/** A team template (CUSTOMIZATION_SPEC section 5). */
export const TeamSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  seats: z
    .array(
      z.object({
        seat: SeatIdSchema,
        /** A guard like `phase in [build, verify]`; the orchestrator evaluates it. */
        when: z.string().optional(),
      }),
    )
    .min(1),
  limits: z.object({ max_active: z.number().int().min(1).max(12).default(5) }).prefault({}),
  dispatch: z.object({ mode: z.enum(['auto', 'teams', 'sessions', 'manual']).default('auto') }).prefault({}),
})
export type Team = z.infer<typeof TeamSchema>
