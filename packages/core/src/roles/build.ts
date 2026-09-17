import matter from 'gray-matter'
import type { SeatConfig } from '../schema/config.js'
import type { Capability, RoleFrontmatter } from '../schema/role.js'
import { RoleFrontmatterSchema } from '../schema/role.js'
import { extractBlock, replaceBlock, startMarker } from './markers.js'

export interface RoleSource {
  frontmatter: RoleFrontmatter
  body: string
}

export interface CapabilitySource {
  meta: Capability
  body: string
}

export interface BuildRoleInput {
  seat: string
  /** The package's base role, from `.delphi/roles/<base>.md`. */
  base: RoleSource
  /** Capability packs, in the order the seat declares them. */
  capabilities?: CapabilitySource[]
  /**
   * `models.<seat>` from config.yaml — the per-seat default.
   *
   * Base role templates deliberately carry no model or effort: the recommended defaults
   * live in one visible, editable place instead of being baked into files the package
   * regenerates (ROLES_SPEC section 1).
   */
  modelDefaults?: { model?: string; effort?: string } | undefined
  /** `seats.<seat>` from config.yaml. */
  seatConfig?: SeatConfig | undefined
  /** Per-project override from `team.yaml`. */
  teamOverride?: { model?: string; effort?: string } | undefined
  /** A one-off override from the command line or a dispatch. */
  dispatchOverride?: { model?: string; effort?: string } | undefined
  /** The current generated file, so its project block survives the rebuild. */
  existing?: string | undefined
}

export interface BuildRoleResult {
  content: string
  /** Non-fatal notes for the user: unmet requirements, suggested permissions. */
  warnings: string[]
  /** Permission rules the capabilities suggest. Never written without --apply-permissions. */
  suggestedPermissions: { allow: string[]; deny: string[] }
}

export class RoleBuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RoleBuildError'
  }
}

const PROJECT_BLOCK_PLACEHOLDER = [
  '<!-- Your notes for this seat on this project. delphi never overwrites anything between',
  '     these markers, so put local conventions, gotchas and reminders here. -->',
].join('\n')

/**
 * Compose the final `.claude/agents/<seat>.md`.
 *
 * Frontmatter precedence, highest first (CUSTOMIZATION_SPEC section 4):
 *   1. the dispatch or command-line override
 *   2. `team.yaml` for this project
 *   3. `seats.<seat>` in config.yaml
 *   4. `models.<seat>` in config.yaml, the per-seat default
 *   5. capability frontmatter, and only the fields capabilities may contribute
 *   6. the base role
 */
export function buildRole(input: BuildRoleInput): BuildRoleResult {
  const capabilities = input.capabilities ?? []
  const warnings: string[] = []

  assertCapabilitiesApply(input, capabilities)
  assertNoCapabilityConflicts(capabilities)

  const frontmatter = mergeFrontmatter(input, capabilities)
  assertToolsAreNotBothRequiredAndDenied(frontmatter, capabilities)

  for (const { meta } of capabilities) {
    for (const command of meta.requires.commands) {
      warnings.push(`capability ${meta.id} needs the command \`${command}\` on PATH`)
    }
    for (const server of meta.requires.mcp_servers) {
      warnings.push(
        `capability ${meta.id} needs the MCP server \`${server}\` configured in project or user settings ` +
          '(a teammate does not inherit mcpServers from this file)',
      )
    }
    for (const skill of meta.requires.skills) {
      warnings.push(
        `capability ${meta.id} needs the skill \`${skill}\` installed ` +
          '(a teammate never receives skills from frontmatter)',
      )
    }
  }

  // The project block is the user's. Carry it over verbatim, or seed it once.
  const existingProject = input.existing ? extractBlock(stripFrontmatter(input.existing), 'project') : null

  let body = ''
  body = replaceBlock(body, 'core', input.base.body.trim())
  body = replaceBlock(body, 'capabilities', renderCapabilities(capabilities))
  body = replaceBlock(body, 'project', existingProject ?? PROJECT_BLOCK_PLACEHOLDER)

  const content = matter.stringify(`\n${body.trim()}\n`, frontmatter)

  return {
    content,
    warnings,
    suggestedPermissions: {
      allow: capabilities.flatMap((c) => c.meta.permissions.allow),
      deny: capabilities.flatMap((c) => c.meta.permissions.deny),
    },
  }
}

function stripFrontmatter(text: string): string {
  return matter(text).content
}

function renderCapabilities(capabilities: CapabilitySource[]): string {
  if (capabilities.length === 0) {
    return '<!-- No capability packs are merged into this seat. -->'
  }
  return capabilities
    .map(({ meta, body }) =>
      [
        startMarker(`cap:${meta.id}`),
        `## Capability: ${meta.title}${meta.risk === 'high' ? ' (high risk)' : ''}`,
        '',
        body.trim(),
        `<!-- delphi:cap:${meta.id}:end -->`,
      ].join('\n'),
    )
    .join('\n\n')
}

function assertCapabilitiesApply(input: BuildRoleInput, capabilities: CapabilitySource[]): void {
  const base = input.seatConfig?.base ?? input.seat
  for (const { meta } of capabilities) {
    const applies = meta.applies_to.includes('*') || meta.applies_to.includes(base)
    if (!applies) {
      throw new RoleBuildError(
        `capability ${meta.id} does not apply to base role ${base} ` +
          `(applies_to: ${meta.applies_to.join(', ')})`,
      )
    }
  }
}

function assertNoCapabilityConflicts(capabilities: CapabilitySource[]): void {
  const present = new Set(capabilities.map((c) => c.meta.id))
  for (const { meta } of capabilities) {
    for (const other of meta.conflicts_with) {
      if (present.has(other)) {
        throw new RoleBuildError(`capabilities ${meta.id} and ${other} declare a conflict`)
      }
    }
  }
}

function assertToolsAreNotBothRequiredAndDenied(
  frontmatter: RoleFrontmatter,
  capabilities: CapabilitySource[],
): void {
  const denied = new Set(toList(frontmatter.disallowedTools))
  if (denied.size === 0) return
  for (const { meta } of capabilities) {
    for (const tool of meta.requires.tools) {
      if (denied.has(tool)) {
        throw new RoleBuildError(
          `capability ${meta.id} requires the tool \`${tool}\`, which this seat denies via disallowedTools`,
        )
      }
    }
  }
}

function toList(value: string | string[] | undefined): string[] {
  if (!value) return []
  return Array.isArray(value)
    ? value
    : value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
}

function mergeFrontmatter(input: BuildRoleInput, capabilities: CapabilitySource[]): RoleFrontmatter {
  // Capabilities may only add tools. They may not set the model, the effort or the colour:
  // those belong to the seat, and a pack silently changing them would be a surprise.
  const capabilityTools = capabilities.flatMap((c) => c.meta.requires.tools)
  const baseTools = toList(input.base.frontmatter.tools)
  const tools = [...new Set([...baseTools, ...capabilityTools])]

  const merged: Record<string, unknown> = {
    ...input.base.frontmatter,
    name: input.seat,
  }

  if (tools.length > 0) merged.tools = tools
  if (input.seatConfig?.description) merged.description = input.seatConfig.description

  // Lowest to highest, so the last write wins.
  for (const layer of [input.modelDefaults, input.seatConfig, input.teamOverride, input.dispatchOverride]) {
    if (layer?.model) merged.model = layer.model
    if (layer?.effort) merged.effort = layer.effort
  }

  return RoleFrontmatterSchema.parse(merged)
}

/**
 * Two seats owning the same path is the failure Agent Teams guidance warns about: both
 * edit it, and one silently loses. Reported across the whole team rather than per seat,
 * because the clash only exists between seats.
 */
export function findOwnershipConflicts(
  seats: Record<string, { owns?: string[] }>,
): Array<{ glob: string; seats: string[] }> {
  const owners = new Map<string, string[]>()
  for (const [seat, config] of Object.entries(seats)) {
    for (const glob of config.owns ?? []) {
      owners.set(glob, [...(owners.get(glob) ?? []), seat])
    }
  }
  return [...owners.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([glob, list]) => ({ glob, seats: list }))
}
