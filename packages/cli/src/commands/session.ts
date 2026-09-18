import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  appendJournal,
  appendLine,
  BoardSchema,
  ClaudeAdapter,
  checkProjectContext,
  checkStories,
  isoNow,
  openTasks,
  readOr,
  readYaml,
  type Surface,
} from '@delphi-team/core'
import { Command } from 'commander'
import { execa } from 'execa'
import { requireInitialised, resolveProject, UserError } from '../context.js'
import { createReporter } from '../output.js'
import { openPanes, reportSurface } from '../surface.js'
import { IN_FLIGHT, readStories } from './dept.js'

/** `<prefix>-<seat>`, the naming convention the orchestrator addresses seats by. */
function sessionName(slug: string, seat: string, prefixLength: number): string {
  return `${slug.slice(0, prefixLength)}-${seat}`
}

/**
 * Everything a seat needs to start working, in one call.
 *
 * The `/seat` skill runs this. It exists so a manual session in Claude Desktop reaches the
 * same state a dispatched one would, rather than a human pasting a role description.
 */
export function seatCommand(): Command {
  return new Command('seat')
    .description('the package a seat needs to start')
    .argument('<seat>')
    .argument('[slug]')
    .option('--json', 'machine-readable output')
    .action(async (seat: string, slug: string | undefined, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const resolved = await resolveProject(context, slug)
      const paths = context.paths.project(resolved)

      const agentPath = context.paths.agent(seat)
      if (!existsSync(agentPath)) {
        throw new UserError(
          `there is no seat called "${seat}" in this project`,
          'run `delphi role list` to see the seats, or ask the orchestrator which one you are',
        )
      }

      const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })
      const mine = openTasks(board).filter((t) => t.owner === seat)
      const inbox = await readInbox(paths.inbox(seat))

      const pack = {
        seat,
        project: resolved,
        sessionName: sessionName(resolved, seat, context.config.project_prefix_len),
        model: context.config.models[seat]?.model ?? null,
        effort: context.config.models[seat]?.effort ?? null,
        definition: await readFile(agentPath, 'utf8'),
        state: await readOr(paths.state, ''),
        tasks: mine,
        knowledge: await readOr(paths.knowledge(seat), ''),
        inbox,
      }

      report.emit(pack, () => {
        report.line(`You are ${seat} on ${resolved}.`)
        report.line(`Name this session: ${pack.sessionName}`)
        if (pack.model) report.line(`Recommended model: ${pack.model} · effort ${pack.effort}`)
        report.line(`\nOpen tasks (${mine.length}):`)
        for (const t of mine) report.line(`  ${t.id}  ${t.status}  ${t.title}`)
        report.line(`\nUnread messages: ${inbox.length}`)
        report.line(`\nYour role definition is at .claude/agents/${seat}.md — read it now.`)
      })
    })
}

async function readInbox(dir: string): Promise<Array<{ file: string; body: string }>> {
  try {
    const files = (await readdir(dir)).sort()
    return await Promise.all(
      files.map(async (file) => ({ file, body: await readFile(join(dir, file), 'utf8') })),
    )
  } catch {
    return []
  }
}

/** Open a seat in this terminal. A new session by default: yesterday context is a liability. */
export function startCommand(): Command {
  return new Command('start')
    .description('open a seat session in this terminal')
    .argument('<seat>')
    .option('--resume', 'continue the previous session instead of starting fresh')
    .option('--project <slug>')
    .option('--print-command', 'print the command instead of running it')
    .action(async (seat: string, options) => {
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const models = context.config.models[seat]

      const args = ['--agent', seat, '--name', sessionName(slug, seat, context.config.project_prefix_len)]
      if (models?.model) args.push('--model', models.model)
      if (models?.effort) args.push('--effort', models.effort)
      if (options.resume) args.push('--resume')

      if (options.printCommand) {
        process.stdout.write(`claude ${args.map(quote).join(' ')}\n`)
        return
      }

      await appendLine(
        context.paths.project(slug).sessions,
        [isoNow(), seat, 'interactive', args.join(' ')].join(' | '),
      )
      // Hand the terminal over: this is the user sitting down at the seat.
      await execa('claude', args, { stdio: 'inherit', reject: false })
    })
}

/** Start a seat as a background session and record what it was started with. */
export function dispatchCommand(): Command {
  return new Command('dispatch')
    .description('start a seat in the background on one story')
    .argument('<seat>')
    .argument('<id>')
    .option('--model <model>')
    .option('--effort <effort>')
    .option('--surface <surface>', 'auto | wt | tmux | vscode | desktop | none')
    .option('--force', 'dispatch even though a pre-flight check blocks it')
    .option('--project <slug>')
    .option('--dry-run', 'print the prompt and the command, start nothing')
    .option('--json', 'machine-readable output')
    .action(async (seat: string, id: string, options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)
      const paths = context.paths.project(slug)

      if (!existsSync(context.paths.agent(seat))) {
        throw new UserError(`no seat "${seat}"`, 'run `delphi role list`')
      }
      const story = await readOr(paths.story(id), '')
      if (!story) {
        throw new UserError(
          `no story ${id}`,
          'a seat dispatched without a story has nothing to work from; write it first',
        )
      }

      // The same pre-flight `dept up` runs. Dispatching one seat used to run none of it, so
      // two stories claiming one file were both started and one seat deleted the other's
      // work (C-018). Every story still in flight is included, because a story in review is
      // not finished and its files are still spoken for.
      const board = await readYaml(paths.board, BoardSchema, { version: 1, tasks: [] })
      const inFlight = board.tasks.filter((task) => IN_FLIGHT.has(task.status)).map((task) => task.id)
      const problems = [
        ...checkStories(await readStories(context, slug, [...new Set([...inFlight, id])])),
        ...checkProjectContext(await readOr(join(context.root, 'docs', 'project-context.md'), '')),
      ]

      const blocks = problems.filter((problem) => problem.severity === 'block')
      for (const problem of problems.filter((p) => p.severity === 'warn')) {
        report.warn(`${problem.message}${problem.fix ? ` — ${problem.fix}` : ''}`)
      }
      if (blocks.length > 0 && !options.force) {
        throw new UserError(
          blocks.map((problem) => problem.message).join('; '),
          `${[...new Set(blocks.map((problem) => problem.fix).filter(Boolean))].join('; ')}
Or pass --force if you have already decided this is fine.`,
        )
      }

      const models = context.config.models[seat]
      const model = (options.model as string) ?? models?.model
      const effort = (options.effort as string) ?? models?.effort
      const name = sessionName(slug, seat, context.config.project_prefix_len)
      const prompt = spawnPrompt(seat, slug, id)

      if (options.dryRun) {
        report.emit({ seat, id, name, model, effort, prompt, dryRun: true }, () => {
          report.line(`Would start ${name}:`)
          report.line(`\n${prompt}\n`)
        })
        return
      }

      const adapter = new ClaudeAdapter({ cwd: context.root })
      const { id: sessionId } = await adapter.dispatch({
        prompt,
        agent: seat,
        name,
        ...(model ? { model } : {}),
        ...(effort ? { effort } : {}),
      })

      // `claude agents --json` reports no model and no agent, so delphi records them here
      // or they are simply not knowable later.
      await appendLine(
        paths.sessions,
        [isoNow(), seat, 'background', sessionId, name, model ?? '-', effort ?? '-', id].join(' | '),
      )
      await appendJournal(paths.journal, {
        id,
        seat: 'orchestrator',
        event: `dispatched ${seat}`,
        detail: `session ${sessionId}`,
      })

      // One seat is still a seat: it gets a pane like any other, so starting work here
      // looks the same as starting it through `dept up`.
      const opened = await openPanes(
        context,
        (options.surface as Surface | undefined) ?? context.config.dispatch.surface,
        [{ title: seat, id: sessionId }],
        { session: slug },
      )

      report.emit(
        { seat, id, sessionId, name, model, effort, surface: opened.plan, surfaceRan: opened.ran },
        () => {
          report.line(`Started ${name} (${sessionId}) on ${id}.`)
          report.line(`  claude attach ${sessionId}   to watch it`)
          reportSurface(report, opened)
        },
      )
    })
}

/** The standard spawn prompt (ORCHESTRATION_SPEC section 4). */
function spawnPrompt(seat: string, slug: string, id: string): string {
  return [
    `You are ${seat} on project ${slug}.`,
    `Your role definition is loaded. The protocol is .delphi/PROTOCOL.md.`,
    `Task: ${id}. Read .delphi/projects/${slug}/stories/${id}.md first, then docs/project-context.md,`,
    `then .delphi/projects/${slug}/knowledge/${seat}.md if it exists.`,
    `Change only the files the story lists. Anything outside them belongs to another seat: message them.`,
    `When done, run the story verify command and keep the output.`,
    `Report to the orchestrator in the Report Contract shape.`,
    `If you are blocked twice by the same cause, stop and report BLOCKED.`,
  ].join('\n')
}

/**
 * Put a clipboard image on disk so it can be shared.
 *
 * Messages between agents are text, so an image only travels as a path. This is also why
 * the advice is to run `snap` before pasting: pasting has been reported to clear the
 * clipboard, and then the image is gone.
 */
export function snapCommand(): Command {
  return new Command('snap')
    .description('save the clipboard image into the project assets')
    .option('--to <seat>', 'also drop a note in that seat inbox')
    .option('--story <id>', 'attach it to a story')
    .option('--note <text>')
    .option('--project <slug>')
    .option('--json', 'machine-readable output')
    .action(async (options) => {
      const report = createReporter(Boolean(options.json))
      const context = await requireInitialised()
      const slug = await resolveProject(context, options.project)

      const stamp = isoNow().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
      const target = join(context.root, context.config.assets.dir, `${stamp}.png`)
      await mkdir(join(context.root, context.config.assets.dir), { recursive: true })

      await saveClipboardImage(target)

      const relative = `${context.config.assets.dir}/${stamp}.png`
      if (options.to) {
        const inbox = context.paths.project(slug).inbox(options.to as string)
        await mkdir(inbox, { recursive: true })
        await writeFile(
          join(inbox, `${stamp}-snap.md`),
          [
            '---',
            'status: unread',
            `from: ${process.env.DELPHI_SEAT ?? 'user'}`,
            `created: ${isoNow()}`,
            '---',
            '',
            options.note ?? 'Screenshot attached.',
            '',
            `Image: ${relative}`,
            options.story ? `Story: ${options.story}` : '',
          ].join('\n'),
          'utf8',
        )
      }

      report.emit({ path: relative, to: options.to ?? null, story: options.story ?? null }, () => {
        report.line(`Saved ${relative}`)
        if (options.to) report.line(`Left a note in ${options.to} inbox.`)
        report.line('\nSeats read it with the Read tool at that path.')
      })
    })
}

async function saveClipboardImage(target: string): Promise<void> {
  if (process.platform === 'win32') {
    // PowerShell rather than a shell string, so a path with spaces or non-ASCII is safe.
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      '$img = [System.Windows.Forms.Clipboard]::GetImage();',
      'if ($img -eq $null) { Write-Error "no image on the clipboard"; exit 1 }',
      `$img.Save($env:DELPHI_SNAP_TARGET, [System.Drawing.Imaging.ImageFormat]::Png)`,
    ].join(' ')
    try {
      await execa('powershell', ['-NoProfile', '-STA', '-Command', script], {
        env: { DELPHI_SNAP_TARGET: target },
        input: '',
      })
      return
    } catch {
      throw new UserError(
        'there is no image on the clipboard',
        'take a screenshot first (Win+Shift+S), then run this again',
      )
    }
  }

  if (process.platform === 'darwin') {
    try {
      await execa('pngpaste', [target], { input: '' })
      return
    } catch {
      throw new UserError(
        'could not read an image from the clipboard',
        'install pngpaste (`brew install pngpaste`), or save the image and reference its path',
      )
    }
  }

  try {
    await execa('wl-paste', ['--type', 'image/png'], { stdout: { file: target }, input: '' })
  } catch {
    throw new UserError(
      'could not read an image from the clipboard',
      'install wl-clipboard or xclip, or save the image and reference its path',
    )
  }
}

function quote(value: string): string {
  return /[\s"]/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value
}
