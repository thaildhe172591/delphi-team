import matter from 'gray-matter'
import { parse } from 'yaml'
import type { CapabilitySource, RoleSource } from '../roles/build.js'
import type { Capability, RoleFrontmatter, Team } from '../schema/role.js'
import { CapabilitySchema, RoleFrontmatterSchema, TeamSchema } from '../schema/role.js'
import { TEMPLATE_FILES } from './files.generated.js'

/**
 * Typed access to the templates embedded at build time.
 *
 * Everything `delphi init` writes comes from here, so the npm package, the PyPI wheels and
 * the generated plugin all produce identical files.
 */

export class TemplateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TemplateError'
  }
}

/** Raw contents of a template, by its path under `packages/templates/files`. */
export function readTemplate(path: string): string {
  const content = TEMPLATE_FILES[path]
  if (content === undefined) {
    throw new TemplateError(`no template at ${path}`)
  }
  return content
}

export function hasTemplate(path: string): boolean {
  return path in TEMPLATE_FILES
}

/** Every template path, sorted. */
export function listTemplates(prefix = ''): string[] {
  return Object.keys(TEMPLATE_FILES)
    .filter((path) => path.startsWith(prefix))
    .sort()
}

function basename(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name.replace(/\.(md|yaml)$/, '')
}

/** Base role ids the package ships, standard ones first, then the optional ones. */
export function listRoles(): string[] {
  return listTemplates('roles/').map(basename)
}

/** A base role: validated frontmatter plus the body that becomes the core block. */
export function readRole(name: string): RoleSource {
  const path = hasTemplate(`roles/${name}.md`) ? `roles/${name}.md` : `roles/optional/${name}.md`
  const { data, content } = matter(readTemplate(path))
  const result = RoleFrontmatterSchema.safeParse(data)
  if (!result.success) {
    throw new TemplateError(`role template ${path} has invalid frontmatter:\n${issues(result.error)}`)
  }
  return { frontmatter: result.data as RoleFrontmatter, body: content.trim() }
}

export function listCapabilities(): string[] {
  return listTemplates('capabilities/').map(basename)
}

export function readCapability(id: string): CapabilitySource {
  const path = `capabilities/${id}.md`
  const { data, content } = matter(readTemplate(path))
  const result = CapabilitySchema.safeParse(data)
  if (!result.success) {
    throw new TemplateError(`capability template ${path} is invalid:\n${issues(result.error)}`)
  }
  return { meta: result.data as Capability, body: content.trim() }
}

export function listTeams(): string[] {
  return listTemplates('teams/').map(basename)
}

export function readTeam(name: string): Team {
  const path = `teams/${name}.yaml`
  const result = TeamSchema.safeParse(parse(readTemplate(path)))
  if (!result.success) {
    throw new TemplateError(`team template ${path} is invalid:\n${issues(result.error)}`)
  }
  return result.data as Team
}

export function listSkills(): string[] {
  return listTemplates('skills/').map((path) => path.split('/')[1] ?? '')
}

/** A skill, with its frontmatter validated enough to catch a broken one at build time. */
export function readSkill(name: string): { frontmatter: Record<string, unknown>; body: string } {
  const { data, content } = matter(readTemplate(`skills/${name}/SKILL.md`))
  if (typeof data.name !== 'string' || typeof data.description !== 'string') {
    throw new TemplateError(`skill template skills/${name}/SKILL.md needs a name and a description`)
  }
  return { frontmatter: data, body: content.trim() }
}

/** The protocol every seat loads, imported into CLAUDE.md. */
export function readProtocol(): string {
  return readTemplate('PROTOCOL.md')
}

/** The commented sample config written by `delphi init`. */
export function readSampleConfig(): string {
  return readTemplate('config.yaml')
}

function issues(error: { issues: Array<{ path: PropertyKey[]; message: string }> }): string {
  return error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n')
}
