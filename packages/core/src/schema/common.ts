import { z } from 'zod'

/**
 * Effort levels Claude Code accepts. Verified against 2.1.274 in Phase 0; note that
 * Opus 4.6 and Sonnet 4.6 do not offer `xhigh`, which `delphi doctor` checks per model.
 */
export const EffortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max'])
export type Effort = z.infer<typeof EffortSchema>

/**
 * A model alias or a full model id. Aliases are validated loosely on purpose: new ones
 * appear without warning, and refusing an unknown alias would break on a Claude Code
 * upgrade, which is exactly the failure mode ADR-0001 exists to avoid.
 */
export const ModelSchema = z.string().min(1)

/** The seat ids the package ships roles for (HARNESS_DESIGN conventions). */
export const STANDARD_SEATS = [
  'orchestrator',
  'ba',
  'pm',
  'techlead',
  'dev-be',
  'dev-fe',
  'db-engineer',
  'qa',
  'tester',
  'reviewer',
] as const

/** Shipped but not enabled by default (ROLES_SPEC 2.11). */
export const OPTIONAL_SEATS = ['devops', 'security', 'ux', 'tech-writer', 'data-analyst'] as const

export type StandardSeat = (typeof STANDARD_SEATS)[number]

/**
 * A seat id: lowercase, hyphenated, no colon. Users invent their own (`ocr-reviewer`),
 * so this validates the shape rather than membership of a fixed list. The colon is
 * excluded because agent definition names must not contain one.
 */
export const SeatIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be lowercase words joined by single hyphens')

export const ModelEffortSchema = z.object({
  model: ModelSchema.optional(),
  effort: EffortSchema.optional(),
})

/** Where a seat is dispatched (ORCHESTRATION_SPEC section 2). */
export const DispatchModeSchema = z.enum(['auto', 'teams', 'sessions', 'manual'])
export type DispatchMode = z.infer<typeof DispatchModeSchema>

/** How the user watches seats work (HARNESS_DESIGN section 6). */
export const SurfaceSchema = z.enum(['wt', 'tmux', 'vscode', 'desktop', 'none'])
export type Surface = z.infer<typeof SurfaceSchema>
