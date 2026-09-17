import { z } from 'zod'
import { DispatchModeSchema, EffortSchema, ModelSchema, SeatIdSchema, SurfaceSchema } from './common.js'

/** One seat's composition: a base role plus capability packs plus overrides. */
export const SeatConfigSchema = z.object({
  base: SeatIdSchema.optional(),
  capabilities: z.array(z.string().min(1)).default([]),
  model: ModelSchema.optional(),
  effort: EffortSchema.optional(),
  /** Globs this seat owns. Overlapping `owns` across seats is a build error. */
  owns: z.array(z.string().min(1)).default([]),
  description: z.string().optional(),
})
export type SeatConfig = z.infer<typeof SeatConfigSchema>

export const ConfigSchema = z.object({
  version: z.literal(1),
  /** Language seats answer the user in. Agent-to-agent traffic stays terse and English. */
  language: z.string().min(2).default('en'),
  project_prefix_len: z.number().int().min(2).max(32).default(8),

  defaults: z
    .object({
      team: z.string().min(1).default('feature'),
      track: z.enum(['quick', 'standard', 'enterprise']).default('standard'),
    })
    .prefault({}),

  dispatch: z
    .object({
      mode: DispatchModeSchema.default('auto'),
      surface: SurfaceSchema.default('auto'),
      /** Agent Teams guidance is 3-5 active members; more than that coordinates badly. */
      max_active: z.number().int().min(1).max(12).default(5),
      hard_limit: z.number().int().min(1).max(20).default(8),
      confirm_before_dispatch: z.boolean().default(true),
      teams: z
        .object({
          /** Maps onto Claude Code's top-level `teammateMode` setting. */
          teammate_mode: z.enum(['in-process', 'tmux', 'iterm2', 'auto']).default('in-process'),
          /** Maps onto `subagentPromptCacheTtl`; teammates otherwise get the 5-minute bucket. */
          subagent_cache_ttl: z.enum(['5m', '1h']).default('1h'),
        })
        .prefault({}),
    })
    .prefault({}),

  /** Per-seat model and effort defaults (ROLES_SPEC section 2). */
  models: z.record(SeatIdSchema, z.object({ model: ModelSchema, effort: EffortSchema })).prefault({}),

  seats: z.record(SeatIdSchema, SeatConfigSchema).prefault({}),

  context: z
    .object({
      /** Passed to `claude --autocompact`. Claude Code accepts 100k-1M. */
      orchestrator_autocompact: z.string().default('400k'),
      /** SessionStart injection budget. Claude Code spills anything over 10,000 chars to a file. */
      session_start_budget_kb: z.number().int().min(1).max(9).default(4),
      resume_budget_tokens: z.number().int().min(1000).default(12000),
    })
    .prefault({}),

  resume: z
    .object({
      auto_continue: z.boolean().default(false),
      journal_tail: z.number().int().min(1).default(50),
      decisions_tail: z.number().int().min(1).default(10),
    })
    .prefault({}),

  memory: z
    .object({
      /** Claude Code preloads the first 200 lines or 25 KB of MEMORY.md; stay under it. */
      compact_threshold_lines: z.number().int().min(20).max(200).default(180),
    })
    .prefault({}),

  assets: z
    .object({
      dir: z.string().default('.delphi/assets'),
      max_mb: z.number().int().min(1).default(10),
    })
    .prefault({}),

  safety: z
    .object({
      db_default: z.enum(['read-only', 'read-write']).default('read-only'),
      allow_production: z.boolean().default(false),
      /** Regexes applied to report text before it is written. */
      redact_patterns: z.array(z.string()).default([]),
    })
    .prefault({}),

  worktree: z
    .object({
      copy_untracked: z.array(z.string()).default(['.env']),
    })
    .prefault({}),

  privacy: z
    .object({
      commit_ledger: z.boolean().default(true),
      private_paths: z.array(z.string()).default([]),
    })
    .prefault({}),

  budget: z
    .object({
      warn_parallel_sessions: z.number().int().min(1).default(4),
    })
    .prefault({}),
})

export type Config = z.infer<typeof ConfigSchema>
