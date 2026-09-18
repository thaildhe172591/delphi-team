import { DELPHI_HOOKS } from '../init/settings.js'
import { listCapabilities, listRoles, listSkills, readTemplate } from '../templates/index.js'

/**
 * Generate a Claude Code plugin from the same templates everything else uses.
 *
 * For people who want the roles, skills and hooks without installing a CLI. The layout is
 * the one Claude Code actually loads, confirmed in Phase 0 against the shipped plugins:
 * `.claude-plugin/plugin.json` at the root, and every other directory beside it rather
 * than inside it.
 *
 * What a plugin cannot carry is the honest part. Plugin-shipped agents ignore `hooks`,
 * `mcpServers` and `permissionMode`, and the CLI is what writes and locks the ledger. So
 * the plugin gives you the roles and the protocol; it does not give you the department.
 */

export interface PluginFile {
  /** Path relative to the plugin root. */
  path: string
  content: string
}

export interface PluginExport {
  files: PluginFile[]
  /** What the user should know about the difference from the CLI. */
  limitations: string[]
}

export interface PluginOptions {
  name?: string
  version: string
  description?: string
  /** How the hooks should invoke the CLI, when it is present. */
  cliCommand?: string
}

export function buildPlugin(options: PluginOptions): PluginExport {
  const name = options.name ?? 'delphi-team'
  const cliCommand = options.cliCommand ?? 'delphi'
  const files: PluginFile[] = []

  files.push({
    path: '.claude-plugin/plugin.json',
    content: `${JSON.stringify(
      {
        name,
        description:
          options.description ??
          'Run Claude Code as a department: roles, a shared protocol, and the skills that drive them.',
        version: options.version,
      },
      null,
      2,
    )}\n`,
  })

  // Roles, flattened: a plugin has no notion of an optional subdirectory.
  for (const role of listRoles()) {
    files.push({ path: `agents/${role}.md`, content: rawRole(role) })
  }

  for (const skill of listSkills()) {
    files.push({ path: `skills/${skill}/SKILL.md`, content: readTemplate(`skills/${skill}/SKILL.md`) })
  }

  // The hooks a plugin can carry. They call the CLI, so they do nothing without it —
  // which the README says rather than leaving the user to discover it.
  files.push({
    path: 'hooks/hooks.json',
    content: `${JSON.stringify(
      {
        hooks: Object.fromEntries(
          Object.entries(DELPHI_HOOKS).map(([event, spec]) => [
            event,
            [
              {
                ...('matcher' in spec ? { matcher: spec.matcher } : {}),
                hooks: [{ type: 'command', command: `${cliCommand} hook ${event}`, timeout: spec.timeout }],
              },
            ],
          ]),
        ),
      },
      null,
      2,
    )}\n`,
  })

  files.push({ path: 'PROTOCOL.md', content: readTemplate('PROTOCOL.md') })
  files.push({ path: 'README.md', content: pluginReadme(name, cliCommand) })

  return {
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
    limitations: [
      'plugin-shipped agents ignore hooks, mcpServers and permissionMode',
      `the hooks call \`${cliCommand}\`, so they do nothing unless the CLI is installed`,
      'the ledger, the board and every delphi command come from the CLI, not from the plugin',
      `${listCapabilities().length} capability packs are not included: they are composed into seats by the CLI`,
    ],
  }
}

function rawRole(name: string): string {
  try {
    return readTemplate(`roles/${name}.md`)
  } catch {
    return readTemplate(`roles/optional/${name}.md`)
  }
}

function pluginReadme(name: string, cliCommand: string): string {
  return `# ${name}

The delphi-team roles, protocol and skills as a Claude Code plugin.

## What you get

- Agent definitions for every seat: orchestrator, BA, PM, tech lead, backend, frontend, database, QA,
  tester, reviewer, and the optional ones.
- The skills that drive them: \`/delphi-dept\`, \`/delphi-resume\`, \`/delphi-seat\`, \`/delphi-role\`, \`/delphi-shift-end\`, \`/delphi-checkpoint\`.
- \`PROTOCOL.md\`, the rules every seat follows.

## What you do not get

A plugin cannot do everything the CLI does, and it is better to know which:

- **Plugin-shipped agents ignore \`hooks\`, \`mcpServers\` and \`permissionMode\`.** That is a Claude Code
  rule, not a delphi one.
- **The hooks here call \`${cliCommand}\`.** Without the CLI installed they run, fail, and are logged —
  by design they never break your session, but they also do nothing.
- **The ledger is the CLI.** The project state, the board, the stories, the reports, the locking that lets
  several seats write at once — all of that is \`${cliCommand}\`, not this plugin.

So: use the plugin if you want the roles and the way of working. Install the CLI if you want the department.

## Installing

\`\`\`
/plugin marketplace add <owner>/${name}
\`\`\`

Then install the CLI alongside it:

\`\`\`
npm install -g ${name}
\`\`\`
`
}
