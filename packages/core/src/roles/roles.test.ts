import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import type { Capability, RoleFrontmatter } from '../schema/role.js'
import { CapabilitySchema } from '../schema/role.js'
import { buildRole, findOwnershipConflicts, RoleBuildError } from './build.js'
import { extractBlock, hasBlock, replaceBlock } from './markers.js'

describe('markers', () => {
  it('round-trips a block', () => {
    const text = replaceBlock('', 'core', 'hello')
    expect(extractBlock(text, 'core')).toBe('hello')
    expect(hasBlock(text, 'core')).toBe(true)
  })

  it('replaces only its own block and leaves the rest byte-identical', () => {
    let text = replaceBlock('', 'core', 'CORE ONE')
    text = replaceBlock(text, 'project', 'MY NOTES')
    const updated = replaceBlock(text, 'core', 'CORE TWO')

    expect(extractBlock(updated, 'core')).toBe('CORE TWO')
    expect(extractBlock(updated, 'project')).toBe('MY NOTES')
  })

  it('appends a block that is missing rather than dropping it', () => {
    // An older generated file must gain new sections on upgrade, not lose them.
    const text = replaceBlock('# existing file\n', 'capabilities', 'NEW')
    expect(text).toContain('# existing file')
    expect(extractBlock(text, 'capabilities')).toBe('NEW')
  })

  it('reports a missing block as null rather than empty', () => {
    expect(extractBlock('nothing here', 'project')).toBeNull()
    expect(extractBlock(replaceBlock('', 'project', ''), 'project')).toBe('')
  })
})

const baseFrontmatter: RoleFrontmatter = {
  name: 'dev-be',
  description: 'Backend developer.',
  model: 'opus',
  effort: 'xhigh',
  memory: 'project',
}

const base = { frontmatter: baseFrontmatter, body: '## 1. Identity\nYou build the backend.' }

function capability(overrides: Partial<Capability> & { id: string; title: string }) {
  return { meta: CapabilitySchema.parse(overrides), body: `Body of ${overrides.id}.` }
}

describe('buildRole', () => {
  it('emits all three blocks with a seeded project block', () => {
    const { content } = buildRole({ seat: 'dev-be', base })
    expect(hasBlock(content, 'core')).toBe(true)
    expect(hasBlock(content, 'capabilities')).toBe(true)
    expect(hasBlock(content, 'project')).toBe(true)
    expect(extractBlock(content, 'core')).toContain('You build the backend.')
  })

  it('never overwrites the project block on a rebuild', () => {
    const first = buildRole({ seat: 'dev-be', base }).content
    const edited = replaceBlock(first, 'project', 'Remember: the staging DB resets nightly.')

    const rebuilt = buildRole({
      seat: 'dev-be',
      base: { ...base, body: '## 1. Identity\nRewritten by an upgrade.' },
      existing: edited,
    }).content

    expect(extractBlock(rebuilt, 'core')).toContain('Rewritten by an upgrade.')
    expect(extractBlock(rebuilt, 'project')).toBe('Remember: the staging DB resets nightly.')
  })

  it('merges capability bodies in declaration order, each in its own marked block', () => {
    const { content } = buildRole({
      seat: 'dev-be',
      base,
      capabilities: [
        capability({ id: 'db-engineer', title: 'Database engineering' }),
        capability({ id: 'pythia-oracle', title: 'Pythia', risk: 'high' }),
      ],
    })
    const block = extractBlock(content, 'capabilities') ?? ''
    expect(block.indexOf('db-engineer')).toBeLessThan(block.indexOf('pythia-oracle'))
    expect(block).toContain('## Capability: Pythia (high risk)')
  })

  it('applies the documented precedence, highest layer last', () => {
    const { content } = buildRole({
      seat: 'dev-be',
      base,
      seatConfig: { capabilities: [], owns: [], model: 'claude-opus-4-8', effort: 'high' },
      teamOverride: { effort: 'xhigh' },
      dispatchOverride: { effort: 'max' },
    })
    const { data } = matter(content)
    expect(data.model).toBe('claude-opus-4-8') // config, nothing above it set a model
    expect(data.effort).toBe('max') // dispatch beats team beats config
  })

  it('adds the tools capabilities require, without duplicating', () => {
    const { content } = buildRole({
      seat: 'dev-be',
      base: { ...base, frontmatter: { ...baseFrontmatter, tools: ['Read', 'Bash'] } },
      capabilities: [capability({ id: 'db-engineer', title: 'DB', requires: { tools: ['Bash', 'Grep'] } })],
    })
    expect(matter(content).data.tools).toEqual(['Read', 'Bash', 'Grep'])
  })

  it('refuses a capability that does not apply to the base role', () => {
    expect(() =>
      buildRole({
        seat: 'dev-fe',
        base: { ...base, frontmatter: { ...baseFrontmatter, name: 'dev-fe' } },
        capabilities: [capability({ id: 'db-engineer', title: 'DB', applies_to: ['dev-be'] })],
      }),
    ).toThrow(RoleBuildError)
  })

  it('refuses capabilities that declare a conflict with each other', () => {
    expect(() =>
      buildRole({
        seat: 'dev-be',
        base,
        capabilities: [
          capability({ id: 'read-only-db', title: 'Read only', conflicts_with: ['db-engineer'] }),
          capability({ id: 'db-engineer', title: 'DB' }),
        ],
      }),
    ).toThrow(/conflict/)
  })

  it('refuses a tool that is both required and denied', () => {
    expect(() =>
      buildRole({
        seat: 'reviewer',
        base: {
          ...base,
          frontmatter: { ...baseFrontmatter, name: 'reviewer', disallowedTools: ['Write', 'Edit'] },
        },
        capabilities: [capability({ id: 'fixer', title: 'Fixer', requires: { tools: ['Edit'] } })],
      }),
    ).toThrow(/disallowedTools/)
  })

  it('warns about requirements it cannot satisfy instead of failing silently', () => {
    const { warnings } = buildRole({
      seat: 'dev-be',
      base,
      capabilities: [
        capability({
          id: 'pythia-oracle',
          title: 'Pythia',
          requires: { commands: ['pythia'], skills: ['using-pythia'], mcp_servers: ['oracle'] },
        }),
      ],
    })
    expect(warnings.some((w) => w.includes('pythia') && w.includes('PATH'))).toBe(true)
    // A teammate never receives skills or (in-process) mcpServers from frontmatter,
    // so the warning has to say where they must actually be configured.
    expect(warnings.some((w) => w.includes('using-pythia') && w.includes('teammate'))).toBe(true)
    expect(warnings.some((w) => w.includes('oracle') && w.includes('project or user settings'))).toBe(true)
  })

  it('surfaces suggested permissions without writing them anywhere', () => {
    const { content, suggestedPermissions } = buildRole({
      seat: 'dev-be',
      base,
      capabilities: [capability({ id: 'db', title: 'DB', permissions: { allow: ['Bash(psql *)'] } })],
    })
    expect(suggestedPermissions.allow).toEqual(['Bash(psql *)'])
    expect(content).not.toContain('Bash(psql *)')
  })
})

describe('findOwnershipConflicts', () => {
  it('finds a glob claimed by two seats', () => {
    const conflicts = findOwnershipConflicts({
      'dev-be': { owns: ['src/api/**', 'db/**'] },
      'db-engineer': { owns: ['db/**'] },
      'dev-fe': { owns: ['src/ui/**'] },
    })
    expect(conflicts).toEqual([{ glob: 'db/**', seats: ['dev-be', 'db-engineer'] }])
  })

  it('is quiet when ownership is clean', () => {
    expect(findOwnershipConflicts({ 'dev-be': { owns: ['src/**'] }, qa: {} })).toEqual([])
  })
})
