import { describe, expect, it } from 'vitest'
import { SeatIdSchema } from './common.js'
import { ConfigSchema } from './config.js'
import { CapabilitySchema, TeamSchema } from './role.js'
import { BoardSchema, StorySchema, TASK_TRANSITIONS, TaskStatusSchema } from './work.js'

describe('SeatIdSchema', () => {
  it('accepts the shapes real seats use', () => {
    for (const id of ['orchestrator', 'dev-be', 'db-engineer', 'ocr-reviewer', 'a1']) {
      expect(SeatIdSchema.safeParse(id).success, id).toBe(true)
    }
  })

  it('rejects anything that would break an agent definition name', () => {
    // A colon is the one character Claude Code's agent names must not contain.
    for (const id of ['Dev-BE', 'dev_be', 'dev:be', '-dev', 'dev-', 'dev--be', '']) {
      expect(SeatIdSchema.safeParse(id).success, id).toBe(false)
    }
  })
})

describe('ConfigSchema', () => {
  it('fills a bare config with every documented default', () => {
    const config = ConfigSchema.parse({ version: 1 })

    expect(config.dispatch.mode).toBe('auto')
    expect(config.dispatch.max_active).toBe(5)
    expect(config.dispatch.teams.teammate_mode).toBe('in-process')
    // Teammates otherwise land in the five-minute prompt cache bucket.
    expect(config.dispatch.teams.subagent_cache_ttl).toBe('1h')
    expect(config.safety.db_default).toBe('read-only')
    expect(config.safety.allow_production).toBe(false)
    expect(config.resume.auto_continue).toBe(false)
    expect(config.privacy.commit_ledger).toBe(true)
  })

  it('keeps the session-start budget under what Claude Code will inline', () => {
    // Over 10,000 characters Claude Code spills injected context to a file and passes a
    // path instead, so the budget must stay comfortably below that.
    const config = ConfigSchema.parse({ version: 1 })
    expect(config.context.session_start_budget_kb).toBeLessThan(10)
    expect(ConfigSchema.safeParse({ version: 1, context: { session_start_budget_kb: 64 } }).success).toBe(
      false,
    )
  })

  it('keeps the memory threshold under the MEMORY.md preload limit', () => {
    // Claude Code preloads the first 200 lines or 25 KB, whichever comes first.
    const config = ConfigSchema.parse({ version: 1 })
    expect(config.memory.compact_threshold_lines).toBeLessThanOrEqual(200)
  })

  it('refuses an unknown version rather than guessing', () => {
    expect(ConfigSchema.safeParse({ version: 2 }).success).toBe(false)
  })
})

describe('CapabilitySchema', () => {
  it('defaults to low risk, applying anywhere, with nothing required', () => {
    const capability = CapabilitySchema.parse({ id: 'api-contract', title: 'API contracts' })
    expect(capability.risk).toBe('low')
    expect(capability.applies_to).toEqual(['*'])
    expect(capability.requires.mcp_servers).toEqual([])
    expect(capability.permissions.allow).toEqual([])
  })

  it('accepts the shape of the Pythia pack', () => {
    const capability = CapabilitySchema.parse({
      id: 'pythia-oracle',
      title: 'Pythia — understand and change Oracle',
      applies_to: ['dev-be', 'db-engineer', 'techlead', 'qa'],
      requires: { commands: ['pythia'], skills: ['using-pythia'] },
      risk: 'high',
    })
    expect(capability.requires.commands).toEqual(['pythia'])
    expect(capability.risk).toBe('high')
  })
})

describe('TeamSchema', () => {
  it('needs at least one seat', () => {
    expect(TeamSchema.safeParse({ name: 'empty', seats: [] }).success).toBe(false)
  })

  it('caps active seats where Agent Teams guidance does', () => {
    expect(
      TeamSchema.safeParse({ name: 'big', seats: [{ seat: 'ba' }], limits: { max_active: 50 } }).success,
    ).toBe(false)
  })
})

describe('StorySchema', () => {
  const base = {
    id: 'T-012',
    title: 'Accept OCR uploads',
    type: 'feature',
    owner: 'dev-be',
    status: 'ready',
    created: '2026-09-17T10:00:00+07:00',
    updated: '2026-09-17T10:00:00+07:00',
  }

  it('accepts a minimal story and defaults the rest', () => {
    const story = StorySchema.parse(base)
    expect(story.report_to).toBe('orchestrator')
    expect(story.priority).toBe('normal')
    expect(story.acceptance).toEqual([])
  })

  it('rejects an id that is not the documented shape', () => {
    expect(StorySchema.safeParse({ ...base, id: 'story 12' }).success).toBe(false)
    expect(StorySchema.safeParse({ ...base, id: 't-12' }).success).toBe(false)
  })
})

describe('task transitions', () => {
  it('makes done and cancelled terminal', () => {
    expect(TASK_TRANSITIONS.done).toEqual([])
    expect(TASK_TRANSITIONS.cancelled).toEqual([])
  })

  it('lets every live state reach blocked and cancelled', () => {
    for (const status of ['backlog', 'ready', 'doing', 'review'] as const) {
      expect(TASK_TRANSITIONS[status], status).toContain('blocked')
      expect(TASK_TRANSITIONS[status], status).toContain('cancelled')
    }
  })

  it('covers every status in the enum', () => {
    for (const status of TaskStatusSchema.options) {
      expect(TASK_TRANSITIONS[status], status).toBeDefined()
    }
  })
})

describe('BoardSchema', () => {
  it('starts empty', () => {
    expect(BoardSchema.parse({}).tasks).toEqual([])
  })
})
