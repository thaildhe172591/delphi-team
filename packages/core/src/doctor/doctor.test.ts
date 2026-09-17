import { describe, expect, it } from 'vitest'
import { ConfigSchema } from '../schema/config.js'
import { CapabilitySchema } from '../schema/role.js'
import { MIN_CLAUDE_VERSION } from '../version.js'
import { type DoctorFacts, runChecks, worstLevel } from './checks.js'

const healthy: DoctorFacts = {
  claudeVersion: MIN_CLAUDE_VERSION,
  initialised: true,
  config: ConfigSchema.parse({ version: 1, models: { orchestrator: { model: 'opus', effort: 'high' } } }),
  seats: ['orchestrator', 'dev-be'],
  descriptions: { orchestrator: 'Runs the department.', 'dev-be': 'Builds the backend.' },
  ownershipConflicts: [],
  seatCapabilities: {},
  commandsOnPath: {},
  hooksInstalled: true,
  keybindings: null,
  env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1', CLAUDE_CODE_ENABLE_TODO_TOOLS: '1' },
  projects: [],
  platform: 'linux',
}

function check(facts: Partial<DoctorFacts>, id: string) {
  return runChecks({ ...healthy, ...facts }).find((c) => c.id === id)
}

describe('doctor', () => {
  it('is quiet when everything is in order', () => {
    expect(worstLevel(runChecks(healthy))).toBe('ok')
  })

  it('fails when Claude Code is missing, and says what to do', () => {
    const result = check({ claudeVersion: null }, 'claude-code')
    expect(result?.level).toBe('fail')
    expect(result?.fix).toBeTruthy()
  })

  it('warns about an older Claude Code rather than refusing to run', () => {
    expect(check({ claudeVersion: '2.0.0' }, 'claude-code')?.level).toBe('warn')
    expect(check({ claudeVersion: '9.9.9' }, 'claude-code')?.level).toBe('ok')
  })

  it('stops at the first thing worth fixing when the project is not set up', () => {
    const checks = runChecks({ ...healthy, initialised: false })
    expect(checks.at(-1)?.id).toBe('initialised')
    // No point reporting twelve downstream problems that all have the same cause.
    expect(checks).toHaveLength(2)
  })

  it('treats two seats owning one path as a failure', () => {
    const result = check(
      { ownershipConflicts: [{ glob: 'db/**', seats: ['dev-be', 'db-engineer'] }] },
      'owns:db/**',
    )
    expect(result?.level).toBe('fail')
    expect(result?.title).toContain('db/**')
  })

  it('fails when a capability needs a command that is not there', () => {
    const pythia = CapabilitySchema.parse({
      id: 'pythia-oracle',
      title: 'Pythia',
      requires: { commands: ['pythia'] },
    })
    const result = check(
      { seatCapabilities: { 'dev-be': [pythia] }, commandsOnPath: { pythia: false } },
      'requires:dev-be:pythia',
    )
    expect(result?.level).toBe('fail')
    expect(result?.fix).toContain('install pythia')
  })

  it('says nothing when the required command is present', () => {
    const pythia = CapabilitySchema.parse({
      id: 'pythia-oracle',
      title: 'Pythia',
      requires: { commands: ['pythia'] },
    })
    expect(
      check(
        { seatCapabilities: { 'dev-be': [pythia] }, commandsOnPath: { pythia: true } },
        'requires:dev-be:pythia',
      ),
    ).toBeUndefined()
  })

  it('explains that a teammate will not inherit a required skill', () => {
    const capability = CapabilitySchema.parse({
      id: 'x',
      title: 'X',
      requires: { skills: ['using-pythia'] },
    })
    const result = check({ seatCapabilities: { qa: [capability] } }, 'requires:qa:skill:using-pythia')
    expect(result?.detail).toContain('teammate')
  })

  it('warns when teams mode is configured but not enabled', () => {
    const result = check({ env: {} }, 'agent-teams')
    expect(result?.level).toBe('warn')
    expect(result?.fix).toContain('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS')
  })

  it('warns that the shared task list will be empty when the task tools are off', () => {
    const result = check({ env: { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' } }, 'task-tools')
    expect(result?.level).toBe('warn')
    // The point is that delphi does not depend on it, which the user should hear.
    expect(result?.fix).toContain('board.yaml')
  })

  it('treats a missing keybindings file on Windows as fine', () => {
    // The default binding applies; absence is not a problem to fix.
    const result = check({ platform: 'win32', keybindings: null }, 'image-paste')
    expect(result?.level).toBe('ok')
    expect(result?.title).toContain('Alt+V')
  })

  it('notices a rebound image paste on Windows', () => {
    const result = check(
      { platform: 'win32', keybindings: '{"bindings":[{"bindings":{"ctrl+i":"chat:imagePaste"}}]}' },
      'image-paste',
    )
    expect(result?.title).toContain('rebound')
  })

  it('mentions how the orchestrator bills when it runs on fable', () => {
    const config = ConfigSchema.parse({
      version: 1,
      models: { orchestrator: { model: 'fable', effort: 'high' } },
    })
    const result = check({ config }, 'orchestrator-billing')
    expect(result?.detail).toContain('usage credits')
  })

  it('only complains about a stale STATE when work is actually open', () => {
    const stale = { slug: 'ocr', stateAgeHours: 100, checkpointAgeHours: 1, openTasks: 3 }
    expect(check({ projects: [stale] }, 'state:ocr')?.level).toBe('warn')
    expect(check({ projects: [{ ...stale, openTasks: 0 }] }, 'state:ocr')).toBeUndefined()
  })

  it('warns about an old checkpoint', () => {
    const result = check(
      { projects: [{ slug: 'ocr', stateAgeHours: 1, checkpointAgeHours: 200, openTasks: 0 }] },
      'checkpoint:ocr',
    )
    expect(result?.level).toBe('warn')
  })

  it('warns when seat descriptions will crowd each other out', () => {
    const long = 'x'.repeat(900)
    const descriptions = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((s) => [s, long]))
    expect(check({ descriptions }, 'descriptions')?.level).toBe('warn')
  })
})
