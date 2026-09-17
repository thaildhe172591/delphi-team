import { describe, expect, it } from 'vitest'
import { ConfigSchema } from '../schema/config.js'
import { TeamSchema } from '../schema/role.js'
import { BoardSchema } from '../schema/work.js'
import { type DepartmentInput, guardAdmits, planDepartment, spawnPrompt } from './department.js'
import { chooseDispatchMode, type DispatchFacts, seatsNeedingOwnEffort } from './mode.js'
import { planSurface, renderCommand, SurfaceError, tmuxCommands, windowsTerminalCommand } from './surface.js'

const cliInteractive: DispatchFacts = {
  interactive: true,
  surface: 'cli',
  teamsEnabled: true,
  canLaunchBackground: true,
  leadEffort: 'high',
  seatEfforts: {},
}

describe('choosing a dispatch mode', () => {
  it('uses teams in an interactive CLI session with the experiment on', () => {
    expect(chooseDispatchMode(cliInteractive).mode).toBe('teams')
  })

  it('falls back to sessions when a seat needs its own effort', () => {
    // Teammates inherit the lead effort, so a seat configured for `max` would silently
    // run at `high`. Running it as a background session is the only way to honour it.
    const decision = chooseDispatchMode({
      ...cliInteractive,
      seatEfforts: { 'dev-be': 'max', qa: 'high' },
    })
    expect(decision.mode).toBe('sessions')
    expect(decision.reason).toContain('dev-be')
    expect(decision.reason).toContain('effort')
  })

  it('never uses teams in Claude Desktop', () => {
    const decision = chooseDispatchMode({ ...cliInteractive, surface: 'desktop' })
    expect(decision.mode).toBe('sessions')
    expect(decision.reason).toContain('Desktop')
  })

  it('never uses teams from a non-interactive session', () => {
    expect(chooseDispatchMode({ ...cliInteractive, interactive: false }).mode).toBe('sessions')
  })

  it('falls back to sessions when the experiment is off', () => {
    const decision = chooseDispatchMode({ ...cliInteractive, teamsEnabled: false })
    expect(decision.mode).toBe('sessions')
    expect(decision.reason).toContain('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS')
  })

  it('falls back to manual when nothing else can start a session', () => {
    const decision = chooseDispatchMode({
      ...cliInteractive,
      surface: 'desktop',
      canLaunchBackground: false,
    })
    expect(decision.mode).toBe('manual')
    expect(decision.notes.join(' ')).toContain('paste')
  })

  it('prefers sessions for work that outlives the session', () => {
    // Teammates are not restored on resume, so long work in teams mode is lost.
    const decision = chooseDispatchMode({ ...cliInteractive, longRunning: true })
    expect(decision.mode).toBe('sessions')
    expect(decision.reason).toContain('outlives')
  })

  it('honours an explicit choice but says what will go wrong', () => {
    const decision = chooseDispatchMode({
      ...cliInteractive,
      requested: 'teams',
      teamsEnabled: false,
      seatEfforts: { 'dev-be': 'max' },
    })
    expect(decision.mode).toBe('teams')
    expect(decision.notes.some((n) => n.includes('not enabled'))).toBe(true)
    expect(decision.notes.some((n) => n.includes('inherit'))).toBe(true)
  })

  it('ignores the orchestrator when looking for effort mismatches', () => {
    expect(
      seatsNeedingOwnEffort({ ...cliInteractive, seatEfforts: { orchestrator: 'xhigh', qa: 'high' } }),
    ).toEqual([])
  })
})

describe('when guards', () => {
  it('reads the documented form', () => {
    expect(guardAdmits('phase in [build, verify]', 'build')).toBe(true)
    expect(guardAdmits('phase in [build, verify]', 'design')).toBe(false)
  })

  it('admits a seat with no guard', () => {
    expect(guardAdmits(undefined, 'anything')).toBe(true)
  })

  it('holds a guarded seat when no phase is set', () => {
    expect(guardAdmits('phase in [build]', undefined)).toBe(false)
  })

  it('does not refuse to work over a guard it cannot read', () => {
    expect(guardAdmits('whenever it feels right', 'build')).toBe(true)
  })
})

function department(overrides: Partial<DepartmentInput> = {}): DepartmentInput {
  const now = '2026-09-17T10:00:00+07:00'
  return {
    team: TeamSchema.parse({
      name: 'feature',
      seats: [{ seat: 'orchestrator' }, { seat: 'dev-be' }, { seat: 'dev-fe' }],
      limits: { max_active: 5 },
    }),
    config: ConfigSchema.parse({ version: 1 }),
    board: BoardSchema.parse({
      version: 1,
      tasks: [
        { id: 'T-1', title: 'api', status: 'ready', owner: 'dev-be', updated: now },
        { id: 'T-2', title: 'ui', status: 'ready', owner: 'dev-fe', updated: now },
      ],
    }),
    stories: {
      'T-1': {
        files: ['src/api/**'],
        acceptance: ['it works'],
        deliverables: [],
        verify: 'pnpm test',
        owner: 'dev-be',
      },
      'T-2': {
        files: ['src/ui/**'],
        acceptance: ['it renders'],
        deliverables: [],
        verify: 'pnpm test',
        owner: 'dev-fe',
      },
      ...overrides.stories,
    },
    ...overrides,
  }
}

describe('planning a department', () => {
  it('starts the seats that have work', () => {
    const plan = planDepartment(department())
    expect(plan.ok).toBe(true)
    expect(plan.active.map((s) => s.seat)).toEqual(['dev-be', 'dev-fe'])
  })

  it('never starts the orchestrator as a worker', () => {
    const plan = planDepartment(department())
    expect(plan.active.map((s) => s.seat)).not.toContain('orchestrator')
  })

  it('holds a seat with nothing assigned', () => {
    const input = department()
    input.team = TeamSchema.parse({
      name: 'feature',
      seats: [{ seat: 'orchestrator' }, { seat: 'dev-be' }, { seat: 'qa' }],
    })
    const plan = planDepartment(input)
    expect(plan.held.find((s) => s.seat === 'qa')?.held).toContain('nothing assigned')
  })

  it('holds a seat whose phase has not arrived', () => {
    const input = department()
    input.team = TeamSchema.parse({
      name: 'feature',
      seats: [{ seat: 'orchestrator' }, { seat: 'dev-be' }, { seat: 'dev-fe', when: 'phase in [verify]' }],
    })
    input.phase = 'build'
    const plan = planDepartment(input)
    expect(plan.held.find((s) => s.seat === 'dev-fe')?.held).toContain('verify')
  })

  it('refuses when two stories claim the same files', () => {
    const input = department()
    input.stories['T-2'] = { ...input.stories['T-2'], files: ['src/api/**'] } as never
    const plan = planDepartment(input)
    expect(plan.ok).toBe(false)
    expect(plan.problems.some((p) => p.message.includes('both claim src/api/**'))).toBe(true)
  })

  it('refuses when two seats own the same path', () => {
    const input = department()
    input.config = ConfigSchema.parse({
      version: 1,
      seats: { 'dev-be': { owns: ['db/**'] }, 'db-engineer': { owns: ['db/**'] } },
    })
    const plan = planDepartment(input)
    expect(plan.ok).toBe(false)
    expect(plan.problems.some((p) => p.message.includes('db/**'))).toBe(true)
  })

  it('refuses a story with no acceptance criteria', () => {
    const input = department()
    input.stories['T-1'] = { ...input.stories['T-1'], acceptance: [] } as never
    const plan = planDepartment(input)
    expect(plan.ok).toBe(false)
    expect(plan.problems.some((p) => p.message.includes('T-1 has no acceptance'))).toBe(true)
  })

  it('warns, but does not refuse, when a story has no verify command', () => {
    const input = department()
    input.stories['T-1'] = { ...input.stories['T-1'], verify: undefined } as never
    const plan = planDepartment(input)
    expect(plan.ok).toBe(true)
    expect(plan.problems.some((p) => p.severity === 'warn' && p.message.includes('verify'))).toBe(true)
  })

  it('keeps the number of active seats within the limit', () => {
    const now = '2026-09-17T10:00:00+07:00'
    const seats = ['a', 'b', 'c', 'd', 'e', 'f']
    const input = department({
      team: TeamSchema.parse({
        name: 'big',
        seats: [{ seat: 'orchestrator' }, ...seats.map((s) => ({ seat: s }))],
        limits: { max_active: 3 },
      }),
      board: BoardSchema.parse({
        version: 1,
        tasks: seats.map((s) => ({ id: `T-${s}`, title: s, status: 'ready', owner: s, updated: now })),
      }),
      stories: Object.fromEntries(
        seats.map((s) => [
          `T-${s}`,
          { files: [`src/${s}/**`], acceptance: ['ok'], deliverables: [], owner: s },
        ]),
      ),
    })
    const plan = planDepartment(input)
    expect(plan.active).toHaveLength(3)
    expect(plan.held.filter((h) => h.held?.includes('active limit'))).toHaveLength(3)
  })

  it('counts seats already running against the limit', () => {
    const plan = planDepartment({ ...department(), running: ['qa', 'tester', 'reviewer', 'ba', 'pm'] })
    expect(plan.active).toHaveLength(0)
  })
})

describe('the spawn prompt', () => {
  const prompt = spawnPrompt({
    seat: 'dev-be',
    team: 'feature',
    slug: 'ocr',
    taskId: 'T-1',
    title: 'Accept OCR uploads',
    files: ['src/api/**'],
    deliverables: ['POST /uploads'],
    acceptance: ['a PDF returns a job id'],
    verify: 'pnpm test',
    handoffTo: 'qa',
  })

  it('tells the seat who it is, what to read, and what it owns', () => {
    expect(prompt).toContain('@dev-be')
    expect(prompt).toContain('stories/T-1.md')
    expect(prompt).toContain('docs/project-context.md')
    expect(prompt).toContain('src/api/**')
  })

  it('states what done means and how to prove it', () => {
    expect(prompt).toContain('Done when: a PDF returns a job id')
    expect(prompt).toContain('pnpm test')
  })

  it('names who receives the work and who receives the report', () => {
    expect(prompt).toContain('@qa')
    expect(prompt).toContain('@orchestrator')
  })

  it('tells the seat when to stop instead of trying again', () => {
    expect(prompt).toContain('BLOCKED')
  })

  it('says so plainly when a story lists no files, rather than implying free rein', () => {
    const loose = spawnPrompt({
      seat: 'qa',
      team: 'feature',
      slug: 'ocr',
      taskId: 'T-9',
      title: 'check',
      files: [],
      deliverables: [],
      acceptance: ['ok'],
    })
    expect(loose).toContain('ask the orchestrator before writing')
  })
})

const pane = (title: string) => ({
  title,
  command: 'claude',
  args: ['attach', `id-${title}`],
  cwd: 'D:Dự án delphi',
})

describe('terminal surfaces', () => {
  it('builds one Windows Terminal invocation with the panes chained', () => {
    const [command, ...rest] = windowsTerminalCommand([pane('dev-be'), pane('qa')])
    expect(rest).toHaveLength(0)
    expect(command?.command).toBe('wt')
    // -w 0 targets the current window; without it every pane opens a new one.
    expect(command?.args.slice(0, 2)).toEqual(['-w', '0'])
    expect(command?.args.filter((a) => a === ';')).toHaveLength(1)
    expect(command?.args.filter((a) => a === 'split-pane')).toHaveLength(2)
  })

  it('passes a path with a space and non-ASCII as one argument', () => {
    // Nothing goes through a shell, so quoting is never the caller's problem.
    const [command] = windowsTerminalCommand([pane('dev-be')])
    expect(command?.args).toContain('D:Dự án delphi')
  })

  it('creates, fills, tiles and attaches a tmux session', () => {
    const commands = tmuxCommands('ocr', [pane('dev-be'), pane('qa'), pane('tester')])
    const verbs = commands.map((c) => c.args[0])
    expect(verbs).toEqual(['new-session', 'split-window', 'split-window', 'select-layout', 'attach-session'])
    expect(commands.every((c) => c.command === 'tmux')).toBe(true)
  })

  it('does nothing with no panes', () => {
    expect(windowsTerminalCommand([])).toEqual([])
    expect(tmuxCommands('ocr', [])).toEqual([])
  })

  it('says Claude Desktop cannot be driven, rather than pretending', () => {
    // Simulating clicks is explicitly out of scope.
    const plan = planSurface('desktop', [pane('dev-be')])
    expect(plan.commands).toEqual([])
    expect(plan.notes.join(' ')).toContain('open the sessions yourself')
  })

  it('refuses Windows Terminal away from Windows', () => {
    if (process.platform === 'win32') return
    expect(() => planSurface('wt', [pane('dev-be')])).toThrow(SurfaceError)
  })

  it('renders a runnable line for the dry run', () => {
    const [command] = windowsTerminalCommand([pane('dev-be')])
    const line = renderCommand(command as never)
    expect(line.startsWith('wt -w 0 split-pane')).toBe(true)
    expect(line).toContain('"D:Dự án delphi"')
  })
})
