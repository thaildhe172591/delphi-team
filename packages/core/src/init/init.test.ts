import { describe, expect, it } from 'vitest'
import { extractBlock, replaceBlock } from '../roles/markers.js'
import {
  BLOCK_END,
  BLOCK_START,
  DELPHI_BLOCK,
  hasDelphiBlock,
  mergeClaudeMd,
  removeClaudeMd,
} from './claudemd.js'
import { type InitInput, pendingWrites, planInit } from './plan.js'
import { DELPHI_HOOKS, hasDelphiHooks, mergeDelphiHooks, removeDelphiHooks } from './settings.js'

describe('settings merge', () => {
  it('installs every delphi hook', () => {
    const { settings } = mergeDelphiHooks({})
    for (const event of Object.keys(DELPHI_HOOKS)) {
      expect(settings.hooks?.[event], event).toBeDefined()
    }
    expect(hasDelphiHooks(settings)).toBe(true)
  })

  it('is idempotent', () => {
    // WORKFLOW section 6 asks for this by name: running init twice must not accumulate.
    const once = mergeDelphiHooks({}).settings
    const twice = mergeDelphiHooks(once).settings
    expect(twice).toEqual(once)

    const handlers = twice.hooks?.SessionStart?.flatMap((g) => g.hooks) ?? []
    expect(handlers).toHaveLength(1)
  })

  it('keeps hooks the user installed', () => {
    const mine = {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'my-own-script.sh' }] }],
        PostToolUse: [{ hooks: [{ type: 'command', command: 'format.sh' }] }],
      },
    }
    const { settings } = mergeDelphiHooks(mine)

    const sessionStart = settings.hooks?.SessionStart?.flatMap((g) => g.hooks) ?? []
    expect(sessionStart.map((h) => h.command)).toEqual(['my-own-script.sh', 'delphi hook SessionStart'])
    expect(settings.hooks?.PostToolUse).toEqual(mine.hooks.PostToolUse)
  })

  it('keeps everything outside the hooks block', () => {
    const { settings } = mergeDelphiHooks({ model: 'opus', permissions: { allow: ['Bash(git *)'] } })
    expect(settings.model).toBe('opus')
    expect(settings.permissions).toEqual({ allow: ['Bash(git *)'] })
  })

  it('anchors the PreToolUse matcher so it does not catch NotebookEdit by accident', () => {
    // `Edit.*` is an unanchored regex in Claude Code and would also match NotebookEdit.
    expect(DELPHI_HOOKS.PreToolUse.matcher).toBe('^(Edit|Write|NotebookEdit)$')
  })

  it('removes exactly what it installed', () => {
    const mine = { hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'mine.sh' }] }] } }
    const installed = mergeDelphiHooks(mine).settings
    const { settings } = removeDelphiHooks(installed)

    expect(hasDelphiHooks(settings)).toBe(false)
    expect(settings.hooks?.SessionStart?.[0]?.hooks[0]?.command).toBe('mine.sh')
    // Events that held nothing but delphi hooks go away entirely.
    expect(settings.hooks?.PreCompact).toBeUndefined()
  })

  it('leaves no empty hooks object behind', () => {
    const { settings } = removeDelphiHooks(mergeDelphiHooks({}).settings)
    expect(settings.hooks).toBeUndefined()
  })

  it('respects a different command name', () => {
    const { settings } = mergeDelphiHooks({}, 'delphi-team')
    expect(settings.hooks?.PreCompact?.[0]?.hooks[0]?.command).toBe('delphi-team hook PreCompact')
    expect(hasDelphiHooks(settings, 'delphi-team')).toBe(true)
    expect(hasDelphiHooks(settings, 'delphi')).toBe(false)
  })
})

describe('CLAUDE.md merge', () => {
  it('creates a file when there is none', () => {
    const { content, change } = mergeClaudeMd('')
    expect(change).toBe('added')
    expect(hasDelphiBlock(content)).toBe(true)
    expect(content).toContain('@.delphi/PROTOCOL.md')
  })

  it('spells the markers the way WORKFLOW section 3 does', () => {
    // Not `delphi:delphi:start`, which is what the role-file marker helper would produce.
    expect(BLOCK_START).toBe('<!-- delphi:start -->')
    expect(BLOCK_END).toBe('<!-- delphi:end -->')
  })

  it('keeps what the user already wrote', () => {
    const mine = '# My project\n\nRun tests with `make test`.\n'
    const { content } = mergeClaudeMd(mine)
    expect(content).toContain('Run tests with `make test`.')
    expect(content).toContain('@.delphi/PROTOCOL.md')
  })

  it('is idempotent', () => {
    const once = mergeClaudeMd('# My project\n').content
    const twice = mergeClaudeMd(once)
    expect(twice.change).toBe('unchanged')
    expect(twice.content).toBe(once)
  })

  it('refreshes a stale block without touching the rest', () => {
    const stale = `# My project\n\nMy notes.\n\n${BLOCK_START}\nold content\n${BLOCK_END}\n`
    const { content, change } = mergeClaudeMd(stale)
    expect(change).toBe('refreshed')
    expect(content).toContain(DELPHI_BLOCK.trim())
    expect(content).not.toContain('old content')
    expect(content).toContain('My notes.')
  })

  it('removes its block and leaves the file usable', () => {
    const mine = '# My project\n\nMy notes.\n'
    const { content, removed } = removeClaudeMd(mergeClaudeMd(mine).content)
    expect(removed).toBe(true)
    expect(content).toContain('My notes.')
    expect(content).not.toContain('delphi')
  })
})

function plan(overrides: Partial<InitInput> = {}) {
  return planInit({ existing: {}, ...overrides })
}

describe('init plan', () => {
  it('scaffolds everything WORKFLOW section 3 lists', () => {
    const { writes } = plan()
    const paths = writes.map((w) => w.path)

    expect(paths).toContain('CLAUDE.md')
    expect(paths).toContain('docs/project-context.md')
    expect(paths).toContain('.claude/settings.json')
    expect(paths).toContain('.delphi/PROTOCOL.md')
    expect(paths).toContain('.delphi/config.yaml')
    expect(paths).toContain('.delphi/index.yaml')
    expect(paths).toContain('.gitignore')
    expect(paths.some((p) => p.startsWith('.claude/agents/'))).toBe(true)
    expect(paths.some((p) => p.startsWith('.claude/skills/'))).toBe(true)
    expect(paths.some((p) => p.startsWith('.delphi/roles/'))).toBe(true)
    expect(paths.some((p) => p.startsWith('.delphi/capabilities/'))).toBe(true)
    expect(paths.some((p) => p.startsWith('.delphi/teams/'))).toBe(true)
  })

  it('creates an agent definition for every seat in the chosen team', () => {
    const { writes, seats } = plan({ team: 'quick-fix' })
    const agents = writes.filter((w) => w.path.startsWith('.claude/agents/')).map((w) => w.path)
    expect(seats).toEqual(['orchestrator', 'dev-be', 'reviewer'])
    expect(agents).toHaveLength(3)
    expect(agents).toContain('.claude/agents/orchestrator.md')
  })

  it('is idempotent: a second run on its own output changes nothing', () => {
    const first = plan()
    const existing = Object.fromEntries(first.writes.map((w) => [w.path, w.content]))
    const second = planInit({ existing })

    expect(pendingWrites(second), 'a second init wanted to write something').toEqual([])
  })

  it('never overwrites a file the user owns', () => {
    const existing = {
      '.delphi/config.yaml': 'version: 1\nlanguage: vi\n',
      'docs/project-context.md': '# mine\n',
    }
    const { writes } = planInit({ existing })

    const config = writes.find((w) => w.path === '.delphi/config.yaml')
    expect(config?.action).toBe('keep')
    expect(config?.content).toBe(existing['.delphi/config.yaml'])
    expect(writes.find((w) => w.path === 'docs/project-context.md')?.action).toBe('keep')
  })

  it('replaces a user-owned file only when forced', () => {
    const existing = { '.delphi/config.yaml': 'version: 1\n' }
    const { writes } = planInit({ existing, force: true })
    const config = writes.find((w) => w.path === '.delphi/config.yaml')
    expect(config?.action).toBe('regenerate')
    expect(config?.content).not.toBe(existing['.delphi/config.yaml'])
  })

  it('regenerates a package-owned file that drifted', () => {
    const { writes } = planInit({ existing: { '.delphi/PROTOCOL.md': 'someone edited this\n' } })
    const protocol = writes.find((w) => w.path === '.delphi/PROTOCOL.md')
    expect(protocol?.action).toBe('regenerate')
    expect(protocol?.content).not.toContain('someone edited this')
  })

  it('keeps the project block inside a seat that already exists', () => {
    const first = plan({ team: 'quick-fix' })
    const agent = first.writes.find((w) => w.path === '.claude/agents/dev-be.md')
    const edited = replaceBlock(agent?.content ?? '', 'project', 'Staging resets nightly.')

    const { writes } = planInit({ existing: { '.claude/agents/dev-be.md': edited }, team: 'quick-fix' })
    const rebuilt = writes.find((w) => w.path === '.claude/agents/dev-be.md')

    expect(extractBlock(rebuilt?.content ?? '', 'project')).toBe('Staging resets nightly.')
    // The round-trip is exact, so there is nothing to write: rebuilding an edited seat
    // reproduces it byte for byte rather than churning the file on every init.
    expect(rebuilt?.action).toBe('keep')
  })

  it('honours a config that composes a seat from capabilities', () => {
    const existing = {
      '.delphi/config.yaml': [
        'version: 1',
        'seats:',
        '  dev-be:',
        '    base: dev-be',
        '    capabilities: [db-engineer, pythia-oracle]',
        '    owns: ["src/api/**", "db/**"]',
      ].join('\n'),
    }
    const { writes, notes } = planInit({ existing, team: 'quick-fix' })
    const agent = writes.find((w) => w.path === '.claude/agents/dev-be.md')

    expect(agent?.content).toContain('Pythia')
    expect(agent?.content).toContain('Database engineering')
    // The user has to be told Pythia needs a command on PATH, not discover it mid-task.
    expect(notes.some((n) => n.includes('pythia'))).toBe(true)
  })

  it('appends to a .gitignore rather than replacing it', () => {
    const { writes } = planInit({ existing: { '.gitignore': 'node_modules/\n' } })
    const gitignore = writes.find((w) => w.path === '.gitignore')
    expect(gitignore?.content).toContain('node_modules/')
    expect(gitignore?.content).toContain('.delphi/logs/')
  })

  it('leaves .gitignore alone when the lines are already there', () => {
    const existing = { '.gitignore': 'node_modules/\n.delphi/logs/\n.delphi/tmp/\n' }
    expect(planInit({ existing }).writes.find((w) => w.path === '.gitignore')).toBeUndefined()
  })

  it('survives a settings.json that does not parse', () => {
    // Refusing here would leave a half-installed project; doctor is the one that complains.
    const { writes } = planInit({ existing: { '.claude/settings.json': '{ broken' } })
    const settings = writes.find((w) => w.path === '.claude/settings.json')
    expect(() => JSON.parse(settings?.content ?? '')).not.toThrow()
  })

  it('warns once about how the orchestrator model bills', () => {
    const { notes } = plan()
    expect(notes.some((n) => n.includes('usage credits'))).toBe(true)
  })

  it('installs hooks that call the command name it was given', () => {
    const { writes } = planInit({ existing: {}, cliCommand: 'delphi-team' })
    const settings = writes.find((w) => w.path === '.claude/settings.json')
    expect(settings?.content).toContain('delphi-team hook SessionStart')
  })
})
