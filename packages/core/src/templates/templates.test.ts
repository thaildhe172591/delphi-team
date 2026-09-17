import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { buildRole } from '../roles/build.js'
import { extractBlock } from '../roles/markers.js'
import { OPTIONAL_SEATS, STANDARD_SEATS } from '../schema/common.js'
import { ConfigSchema } from '../schema/config.js'
import {
  listCapabilities,
  listRoles,
  listTeams,
  listTemplates,
  readCapability,
  readProtocol,
  readRole,
  readSampleConfig,
  readTeam,
  readTemplate,
} from './index.js'

/**
 * These templates are the product: they are what `delphi init` writes into a user's
 * project, and a broken one is not caught by a type checker. Every shipped file is parsed
 * and validated here, and the rules ROLES_SPEC and ORCHESTRATION_SPEC state about their
 * shape are checked rather than trusted.
 */

const ROLE_SECTIONS = [
  'Identity',
  'Scope',
  'Artifacts you own',
  'Inputs and outputs',
  'Startup',
  'Workflow',
  'Definition of done',
  'Reporting',
  'End of shift',
]

describe('shipped roles', () => {
  it('ships every standard seat', () => {
    for (const seat of STANDARD_SEATS) {
      expect(listRoles(), seat).toContain(seat)
    }
  })

  it('ships every optional seat', () => {
    for (const seat of OPTIONAL_SEATS) {
      expect(listRoles(), seat).toContain(seat)
    }
  })

  it.each([...STANDARD_SEATS, ...OPTIONAL_SEATS])('%s has valid frontmatter', (seat) => {
    const role = readRole(seat)
    expect(role.frontmatter.name).toBe(seat)
    expect(role.frontmatter.description.length).toBeGreaterThan(20)
    expect(role.body.length).toBeGreaterThan(200)
  })

  it.each([...STANDARD_SEATS, ...OPTIONAL_SEATS])('%s has all nine sections', (seat) => {
    const { body } = readRole(seat)
    for (const section of ROLE_SECTIONS) {
      expect(body, `${seat} is missing "${section}"`).toContain(section)
    }
  })

  it.each([...STANDARD_SEATS, ...OPTIONAL_SEATS])('%s says what it must not do', (seat) => {
    // ROLES_SPEC section 4: every role needs an explicit DON'T and a checkable done.
    const { body } = readRole(seat)
    expect(body).toMatch(/\*\*DON'T:\*\*|## 2\. Scope/)
    expect(body).toContain('Definition of done')
  })

  it.each([...STANDARD_SEATS, ...OPTIONAL_SEATS])('%s fits what a session will actually load', (seat) => {
    // The /seat skill is re-attached after compaction with only the first 5,000 tokens
    // kept, so a role that runs long loses its ending exactly when it is needed.
    const { body } = readRole(seat)
    expect(body.split('\n').length, `${seat} body is too long`).toBeLessThanOrEqual(250)
  })

  it.each([...STANDARD_SEATS, ...OPTIONAL_SEATS])('%s hard-codes no model or effort', (seat) => {
    // ROLES_SPEC section 1: the defaults live in config.yaml, in one editable place, so a
    // package upgrade never silently changes the model a seat runs on.
    const role = readRole(seat)
    expect(role.frontmatter.model, `${seat} pins a model`).toBeUndefined()
    expect(role.frontmatter.effort, `${seat} pins an effort`).toBeUndefined()
  })

  it('keeps the orchestrator away from source code', () => {
    const { body } = readRole('orchestrator')
    expect(body).toContain('edit source code')
  })

  it('makes the reviewer unable to edit', () => {
    // A reviewer that can edit stops reviewing and starts fixing.
    const { frontmatter } = readRole('reviewer')
    const denied = String(frontmatter.disallowedTools)
    expect(denied).toContain('Write')
    expect(denied).toContain('Edit')
  })

  it('makes the database seat read-only by default', () => {
    const { body } = readRole('db-engineer')
    expect(body).toContain('read-only by default')
    expect(body).toContain('rollback')
  })
})

describe('shipped capabilities', () => {
  it('ships the documented set', () => {
    const capabilities = listCapabilities()
    for (const id of [
      'db-engineer',
      'api-contract',
      'security-review',
      'perf-review',
      'ui-visual-check',
      'data-migration',
      'docs-writer',
      'pythia-oracle',
    ]) {
      expect(capabilities, id).toContain(id)
    }
  })

  it('validates every capability, and each id matches its filename', () => {
    for (const id of listCapabilities()) {
      const { meta, body } = readCapability(id)
      expect(meta.id, id).toBe(id)
      expect(body.length, id).toBeGreaterThan(200)
    }
  })

  it('only targets roles that exist', () => {
    const roles = new Set(listRoles())
    for (const id of listCapabilities()) {
      for (const target of readCapability(id).meta.applies_to) {
        if (target === '*') continue
        expect(roles, `${id} applies_to ${target}`).toContain(target)
      }
    }
  })

  it('makes every risky capability state its guard rails and its evidence', () => {
    for (const id of listCapabilities()) {
      const { meta, body } = readCapability(id)
      expect(body, `${id} has no evidence section`).toContain('Evidence to include')
      if (meta.risk === 'high') {
        expect(body.toLowerCase(), `${id} is high risk but states no rails`).toContain('safety rails')
      }
    }
  })

  it('fills the Pythia pack with facts rather than placeholders', () => {
    // BUILD_PROMPT rule 5 forbids inventing Pythia details; these came from the real
    // install (see docs/research/pythia-capability-notes.md).
    const { meta, body } = readCapability('pythia-oracle')
    expect(meta.risk).toBe('high')
    expect(meta.requires.commands).toContain('pythia')
    expect(body).not.toMatch(/<[A-Z_]{4,}>/) // no unfilled <PLACEHOLDER>
    expect(body).toContain('never mint it')
    expect(body).toContain('written but broken')
    expect(body).toContain('connections.json')
  })
})

describe('shipped teams', () => {
  it('ships the documented templates', () => {
    for (const name of ['quick-fix', 'feature', 'feature-lite', 'project', 'investigation']) {
      expect(listTeams(), name).toContain(name)
    }
  })

  it('validates, names only real seats, and always includes the orchestrator', () => {
    const roles = new Set(listRoles())
    for (const name of listTeams()) {
      const team = readTeam(name)
      expect(team.name, name).toBe(name)
      expect(
        team.seats.map((s) => s.seat),
        name,
      ).toContain('orchestrator')
      for (const { seat } of team.seats) {
        expect(roles, `${name} uses ${seat}`).toContain(seat)
      }
    }
  })

  it('keeps active seats within what a team can actually coordinate', () => {
    // Agent Teams guidance is three to five active members.
    for (const name of listTeams()) {
      expect(readTeam(name).limits.max_active, name).toBeLessThanOrEqual(5)
    }
  })

  it('lets the full project team exist without all of it running at once', () => {
    const project = readTeam('project')
    expect(project.seats.length).toBeGreaterThan(project.limits.max_active)
    expect(project.seats.some((s) => s.when)).toBe(true)
  })
})

describe('the protocol', () => {
  it('has all twelve sections and stays under the cap', () => {
    const protocol = readProtocol()
    const lines = protocol.split('\n')
    expect(lines.length, 'ORCHESTRATION_SPEC section 11 caps this at 150 lines').toBeLessThanOrEqual(150)
    for (let n = 1; n <= 12; n++) {
      expect(protocol, `missing section ${n}`).toContain(`## ${n}.`)
    }
  })

  it('states the rules that stop a department lying to itself', () => {
    const protocol = readProtocol()
    expect(protocol).toContain('not the user')
    expect(protocol).toContain('is not an action')
    expect(protocol).toContain('is a claim, not evidence')
    expect(protocol).toContain('Do not guess')
  })
})

describe('the sample config', () => {
  it('parses against the schema', () => {
    const config = ConfigSchema.parse(parse(readSampleConfig()))
    expect(config.version).toBe(1)
    expect(config.safety.db_default).toBe('read-only')
    expect(config.safety.allow_production).toBe(false)
  })

  it('gives every standard seat a model and an effort', () => {
    const config = ConfigSchema.parse(parse(readSampleConfig()))
    for (const seat of STANDARD_SEATS) {
      expect(config.models[seat], `${seat} has no default`).toBeDefined()
    }
  })
})

describe('safety across every template', () => {
  it('never suggests bypassing permissions', () => {
    // REQUIREMENTS R23 and BUILD_PROMPT section B: not as a default, not as a workaround.
    for (const path of listTemplates()) {
      const content = readTemplate(path)
      expect(content, `${path} mentions bypassPermissions`).not.toContain('bypassPermissions')
      expect(content, `${path} mentions the skip-permissions flag`).not.toContain(
        'dangerously-skip-permissions',
      )
    }
  })

  it('contains nothing that looks like a credential', () => {
    for (const path of listTemplates()) {
      const content = readTemplate(path)
      expect(content, path).not.toMatch(/(password|secret|token)\s*[:=]\s*['"][^'"<\s]{6,}/i)
    }
  })
})

describe('building a real seat from real templates', () => {
  it('composes dev-be with the database and Pythia capabilities', () => {
    // ORCHESTRATION_SPEC section 10 item 4, and REQUIREMENTS R21 and R22: the combined
    // seat is the one the project owner actually wants.
    const { content, warnings } = buildRole({
      seat: 'dev-be',
      base: readRole('dev-be'),
      capabilities: [readCapability('db-engineer'), readCapability('pythia-oracle')],
      modelDefaults: { model: 'opus', effort: 'xhigh' },
      seatConfig: {
        base: 'dev-be',
        capabilities: ['db-engineer', 'pythia-oracle'],
        owns: ['src/api/**', 'db/**'],
      },
    })

    const { data } = matter(content)
    expect(data.name).toBe('dev-be')
    expect(data.model).toBe('opus')

    const core = extractBlock(content, 'core') ?? ''
    const capabilities = extractBlock(content, 'capabilities') ?? ''
    expect(core).toContain('backend developer')
    expect(capabilities).toContain('Database engineering')
    expect(capabilities).toContain('Pythia')
    expect(extractBlock(content, 'project')).not.toBeNull()

    // doctor has to tell the user that Pythia needs a command on PATH.
    expect(warnings.some((w) => w.includes('pythia'))).toBe(true)
  })

  it('builds every standard seat without warnings or errors', () => {
    for (const seat of STANDARD_SEATS) {
      const { content, warnings } = buildRole({ seat, base: readRole(seat) })
      expect(matter(content).data.name, seat).toBe(seat)
      expect(warnings, `${seat} warned with no capabilities attached`).toEqual([])
    }
  })
})
