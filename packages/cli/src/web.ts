import { createReadStream } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, relative, resolve, sep } from 'node:path'
import type { Context } from './context.js'

/**
 * The same read-only view as `delphi watch`, in a browser.
 *
 * Read-only is the whole design, not a limitation: a dashboard that can change things is a
 * second way to change them, and the ledger already has one. So this serves `GET` and
 * nothing else, and there is no endpoint that writes. The board is changed with `delphi`.
 *
 * It binds to 127.0.0.1. A department's board names its people, its blockers and the paths
 * it is working in; none of that belongs on an interface anyone else can reach.
 *
 * No framework and no build step. The page is a string in this file, it polls one JSON
 * endpoint, and the whole thing ships inside a 90 KB CLI.
 */

export interface WebOptions {
  port: number
  /** Called for each request, so the terminal shows the server being used. */
  log?: (line: string) => void
  /** Produces the payload the page renders. */
  state: () => Promise<unknown>
}

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

/**
 * Is this path really inside that directory?
 *
 * `..` in a query string is the oldest trick there is, and the answer has to survive
 * Windows separators and a path that merely starts with the same letters.
 */
export function isInside(directory: string, candidate: string): boolean {
  const relation = relative(resolve(directory), resolve(candidate))
  return relation !== '' && !relation.startsWith('..') && !relation.startsWith(`..${sep}`)
}

export function startWebWatch(context: Context, slug: string, options: WebOptions) {
  const paths = context.paths.project(slug)

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    // Everything here reads. Nothing here writes. That is the contract, and refusing any
    // other method is the cheapest way to keep it true.
    if (request.method !== 'GET') return send(response, 405, 'text/plain', 'read-only')

    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    options.log?.(`${request.method} ${url.pathname}`)

    try {
      if (url.pathname === '/') return send(response, 200, 'text/html; charset=utf-8', page(slug))

      if (url.pathname === '/api/state') {
        const state = await options.state()
        const reports = await listReports(paths.root)
        return send(response, 200, 'application/json', JSON.stringify({ ...(state as object), reports }))
      }

      if (url.pathname === '/api/file') {
        // Reports and handoffs are markdown the seats wrote; showing them is the point of
        // the dashboard. Anything outside the project ledger is not ours to serve.
        const asked = join(paths.root, url.searchParams.get('path') ?? '')
        if (!isInside(paths.root, asked)) return send(response, 403, 'text/plain', 'outside the ledger')
        return send(response, 200, 'text/plain; charset=utf-8', await readFile(asked, 'utf8'))
      }

      if (url.pathname.startsWith('/assets/')) {
        const asked = join(context.paths.assets, decodeURIComponent(url.pathname.slice('/assets/'.length)))
        if (!isInside(context.paths.assets, asked)) return send(response, 403, 'text/plain', 'outside assets')
        if (!(await stat(asked).catch(() => null))?.isFile()) return send(response, 404, 'text/plain', 'no')

        response.writeHead(200, {
          'content-type': TYPES[extname(asked).toLowerCase()] ?? 'application/octet-stream',
        })
        return createReadStream(asked).pipe(response)
      }

      return send(response, 404, 'text/plain', 'no such page')
    } catch (error) {
      // A missing file is the common case and is not worth a stack trace in the terminal.
      return send(response, 404, 'text/plain', error instanceof Error ? error.message : 'not found')
    }
  })

  return new Promise<{ url: string; close: () => void }>((ready, fail) => {
    server.once('error', fail)
    // 127.0.0.1, never 0.0.0.0: a board naming people and blockers is not for the network.
    server.listen(options.port, '127.0.0.1', () => {
      ready({ url: `http://127.0.0.1:${options.port}`, close: () => server.close() })
    })
  })
}

function send(response: ServerResponse, status: number, type: string, body: string): void {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  response.end(body)
}

/** Every report on the project, newest first, as `<seat>/<file>`. */
async function listReports(root: string): Promise<Array<{ seat: string; file: string; path: string }>> {
  const reports: Array<{ seat: string; file: string; path: string }> = []
  const base = join(root, 'reports')

  for (const seat of await readdir(base).catch(() => [])) {
    for (const file of await readdir(join(base, seat)).catch(() => [])) {
      reports.push({ seat, file, path: `reports/${seat}/${file}` })
    }
  }
  return reports.sort((a, b) => b.file.localeCompare(a.file))
}

function page(slug: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${slug} · delphi</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #fbfbfa; --fg: #1a1a18; --dim: #6b6b66; --line: #e2e2dd; --card: #fff;
    --busy: #1f6f43; --wait: #9a5b00; --stop: #a52222;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #16161a; --fg: #e8e8e4; --dim: #9a9a94; --line: #2c2c32; --card: #1d1d22;
            --busy: #5ec489; --wait: #e0a33c; --stop: #ef6b6b; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--fg);
         font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .07em; color: var(--dim);
       margin: 32px 0 10px; font-weight: 600; }
  .sub { color: var(--dim); font-size: 13px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 8px 10px; border-top: 1px solid var(--line); vertical-align: top; }
  tr:first-child td { border-top: 0; }
  .id { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; white-space: nowrap; }
  .tag { font-size: 12px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line);
         white-space: nowrap; }
  .working { color: var(--busy); border-color: currentColor; }
  .waiting { color: var(--wait); border-color: currentColor; }
  .blocked, .stop { color: var(--stop); border-color: currentColor; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px;
          padding: 4px 6px; }
  .empty { color: var(--dim); padding: 8px 10px; }
  details { border-top: 1px solid var(--line); }
  summary { cursor: pointer; padding: 8px 10px; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; padding: 0 10px 12px;
        font: 13px/1.5 ui-monospace, Consolas, monospace; color: var(--dim); }
  footer { max-width: 900px; margin: 40px auto 0; color: var(--dim); font-size: 12px;
           border-top: 1px solid var(--line); padding-top: 12px; }
</style>
</head>
<body>
<main>
  <h1 id="slug">${slug}</h1>
  <div class="sub" id="phase"></div>
  <div class="sub" id="counts"></div>

  <h2>Seats</h2>
  <div class="card"><table id="seats"></table></div>

  <h2>Board</h2>
  <div class="card"><table id="board"></table></div>

  <h2>Reports</h2>
  <div class="card" id="reports"></div>

  <h2>Recent</h2>
  <div class="card"><table id="recent"></table></div>
</main>
<footer>Read-only. Change the board with <code>delphi</code>. Refreshing every 5s.</footer>

<script>
const $ = (id) => document.getElementById(id)
const text = (s) => document.createTextNode(String(s ?? ''))

function row(cells) {
  const tr = document.createElement('tr')
  for (const cell of cells) {
    const td = document.createElement('td')
    if (cell && cell.nodeType) td.appendChild(cell)
    else td.appendChild(text(cell))
    tr.appendChild(td)
  }
  return tr
}

function tag(value) {
  const span = document.createElement('span')
  span.className = 'tag ' + String(value ?? '').replace(/[^a-z]/gi, '')
  span.appendChild(text(value))
  return span
}

function fill(table, rows, emptyMessage) {
  table.replaceChildren()
  if (rows.length === 0) {
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    td.className = 'empty'
    td.appendChild(text(emptyMessage))
    tr.appendChild(td)
    table.appendChild(tr)
    return
  }
  for (const cells of rows) table.appendChild(row(cells))
}

async function refresh() {
  let state
  try {
    state = await (await fetch('/api/state')).json()
  } catch {
    $('phase').textContent = 'lost the server — is delphi watch --web still running?'
    return
  }

  $('phase').textContent = state.phase ?? ''
  $('counts').textContent = Object.entries(state.counts ?? {})
    .map(([status, n]) => n + ' ' + status).join(' · ') || 'nothing on the board'

  fill($('seats'), (state.seats ?? []).map((seat) => [
    seat.seat, tag(seat.state), seat.task, seat.waitingFor ? 'waiting on ' + seat.waitingFor : '',
  ]), 'none running')

  const board = (state.tasks ?? [])
  fill($('board'), board.map((task) => {
    const id = document.createElement('span')
    id.className = 'id'
    id.appendChild(text(task.id))
    return [id, tag(task.status), task.owner, task.title]
  }), 'no tasks yet')

  // Rebuilt only when the set of reports actually changes. Rebuilding every five seconds
  // snapped shut whichever report you had open and threw away the text it had fetched --
  // which is only visible if you open one and then wait.
  fill($('recent'), (state.recent ?? []).map((e) => [e.timestamp, e.seat, e.event]), 'nothing yet')

  const reports = $('reports')
  const key = (state.reports ?? []).map((r) => r.path).join('|')
  if (reports.dataset.key === key) return
  reports.dataset.key = key
  reports.replaceChildren()
  if ((state.reports ?? []).length === 0) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.appendChild(text('no reports yet'))
    reports.appendChild(empty)
  }
  for (const report of state.reports ?? []) {
    const details = document.createElement('details')
    const summary = document.createElement('summary')
    summary.appendChild(text(report.seat + ' · ' + report.file))
    const pre = document.createElement('pre')
    details.append(summary, pre)
    details.addEventListener('toggle', async () => {
      if (!details.open || pre.textContent) return
      pre.textContent = await (await fetch('/api/file?path=' + encodeURIComponent(report.path))).text()
    })
    reports.appendChild(details)
  }

}

refresh()
setInterval(refresh, 5000)
</script>
</body>
</html>`
}
