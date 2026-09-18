import { describe, expect, it } from 'vitest'
import { importBmad } from './import/bmad.js'
import { archiveHeader, CLAUDE_MEMORY_LIMITS, compactMemory, fitsInPreload } from './memory/compact.js'
import { buildPlugin } from './plugin/export.js'

describe('plugin export', () => {
  const plugin = buildPlugin({ version: '1.2.3' })
  const paths = plugin.files.map((f) => f.path)

  it('puts the manifest where Claude Code looks for it', () => {
    // Confirmed in Phase 0 against the shipped plugins: the manifest is inside
    // .claude-plugin, and everything else sits beside it at the root.
    expect(paths).toContain('.claude-plugin/plugin.json')
    const manifest = JSON.parse(
      plugin.files.find((f) => f.path === '.claude-plugin/plugin.json')?.content ?? '{}',
    )
    expect(manifest.name).toBe('delphi-team')
    expect(manifest.version).toBe('1.2.3')
  })

  it('keeps every other directory at the root, not inside .claude-plugin', () => {
    const misplaced = paths.filter((p) => p.startsWith('.claude-plugin/') && !p.endsWith('plugin.json'))
    expect(misplaced).toEqual([])
    expect(paths.some((p) => p.startsWith('agents/'))).toBe(true)
    expect(paths.some((p) => p.startsWith('skills/'))).toBe(true)
  })

  it('ships every seat and every skill', () => {
    for (const seat of ['orchestrator', 'dev-be', 'reviewer', 'devops']) {
      expect(paths, seat).toContain(`agents/${seat}.md`)
    }
    // Every skill is prefixed. `resume` collided with Claude Code's own `/resume`, so
    // typing it ran delphi's instead of the built-in — and a prefix on one of them only
    // would leave you guessing which.
    for (const skill of [
      'delphi-dept',
      'delphi-resume',
      'delphi-seat',
      'delphi-role',
      'delphi-shift-end',
      'delphi-checkpoint',
    ]) {
      expect(paths, skill).toContain(`skills/${skill}/SKILL.md`)
    }
  })

  it('flattens the optional roles rather than keeping a subdirectory a plugin cannot use', () => {
    expect(paths).toContain('agents/security.md')
    expect(paths.some((p) => p.includes('optional/'))).toBe(false)
  })

  it('states what a plugin cannot do, rather than leaving it to be discovered', () => {
    const readme = plugin.files.find((f) => f.path === 'README.md')?.content ?? ''
    expect(readme).toContain('ignore `hooks`, `mcpServers` and `permissionMode`')
    expect(readme).toContain('do nothing')
    expect(plugin.limitations.some((l) => l.includes('permissionMode'))).toBe(true)
    expect(plugin.limitations.some((l) => l.includes('ledger'))).toBe(true)
  })

  it('produces the same file list every time, in a stable order', () => {
    // CI diffs the generated plugin, so an unstable order would fail every build for no
    // reason. The order is localeCompare, which is not the same as the default sort.
    expect(buildPlugin({ version: '1.2.3' }).files).toEqual(plugin.files)
    expect(paths).toEqual([...paths].sort((a, b) => a.localeCompare(b)))
  })
})

describe('memory compaction', () => {
  const long = (sections: number) =>
    Array.from({ length: sections }, (_, i) => `## Lesson ${i}\n\nSomething learned number ${i}.\n`).join(
      '\n',
    )

  it('knows what already fits the preload window', () => {
    expect(fitsInPreload('## One\n\nshort\n')).toBe(true)
    expect(fitsInPreload(`${'x\n'.repeat(500)}`)).toBe(false)
    expect(fitsInPreload(`${'x'.repeat(30_000)}`)).toBe(false)
  })

  it('leaves a file that fits completely alone', () => {
    const text = '## One\n\nshort\n'
    const result = compactMemory(text, 180)
    expect(result.unchanged).toBe(true)
    expect(result.kept).toBe(text)
    expect(result.archived).toBeNull()
  })

  it('cuts at a section heading, so neither half starts or ends mid-section', () => {
    const result = compactMemory(long(60), 40)
    expect(result.unchanged).toBe(false)
    // The archive begins with a whole section…
    expect(result.archived?.startsWith('## Lesson')).toBe(true)
    // …and what is kept never ends on a heading whose body was cut away from it.
    expect(result.kept.trimEnd().split('\n').at(-1)).not.toMatch(/^## /)
  })

  it('never loses anything: kept plus archived is the whole file', () => {
    const text = long(60)
    const { kept, archived } = compactMemory(text, 40)
    const words = `${kept}\n${archived}`
    for (let i = 0; i < 60; i++) expect(words, `lesson ${i}`).toContain(`Something learned number ${i}.`)
  })

  it('keeps the top, because the top is the part Claude Code reads', () => {
    const { kept } = compactMemory(long(60), 40)
    expect(kept).toContain('## Lesson 0')
    expect(kept).not.toContain('## Lesson 59')
  })

  it('never keeps more than Claude Code will preload, whatever threshold is asked for', () => {
    const result = compactMemory(long(200), 1000)
    expect(result.keptLines).toBeLessThanOrEqual(CLAUDE_MEMORY_LIMITS.maxLines)
  })

  it('falls back to the line limit when there is no heading to cut at', () => {
    const result = compactMemory('x\n'.repeat(400), 100)
    expect(result.keptLines).toBe(100)
    expect(result.archived).not.toBeNull()
  })

  it('explains the archive to whoever opens it', () => {
    const header = archiveHeader('dev-be', '2026-09-17')
    expect(header).toContain('dev-be')
    expect(header).toContain('Nothing here was deleted')
    expect(header).toContain('move it back to the top')
  })
})

describe('importing an existing BMAD project', () => {
  const now = '2026-09-17T10:00:00+07:00'

  it('says so plainly when there is nothing it recognises', () => {
    const result = importBmad({ files: { 'src/index.ts': 'console.log(1)' } }, now)
    expect(result.findings).toEqual([])
    expect(result.notes.some((n) => n.includes('may not be a BMAD project'))).toBe(true)
    expect(result.unrecognised).toContain('src/index.ts')
  })

  it('builds a brief from a PRD, and says to rewrite it', () => {
    const result = importBmad(
      {
        files: {
          'docs/prd.md': '# Claims intake\n\n## Goal\nReduce manual entry.\n\n## Scope\nUpload and OCR.\n',
        },
      },
      now,
    )
    expect(result.brief).toContain('Claims intake')
    expect(result.brief).toContain('Reduce manual entry.')
    // An imported brief carries the previous project's assumptions, which is the thing a
    // new department most needs to question.
    expect(result.brief).toContain('rewrite it in your own terms')
  })

  it('turns epics and stories into board entries', () => {
    const result = importBmad(
      {
        files: {
          'docs/epics/epic-1.md': '---\nid: EPIC-1\nstatus: in-progress\n---\n# Upload pipeline\n',
          'docs/stories/story-12.md': '---\nid: STORY-12\nstatus: done\nowner: dev-be\n---\n# Accept PDFs\n',
        },
      },
      now,
    )
    const ids = result.tasks.map((t) => t.id)
    expect(ids).toContain('EPIC-1')
    expect(ids).toContain('STORY-12')
    expect(result.tasks.find((t) => t.id === 'EPIC-1')?.status).toBe('doing')
    expect(result.tasks.find((t) => t.id === 'STORY-12')?.owner).toBe('dev-be')
  })

  it('lets sprint status win over a stale document', () => {
    const result = importBmad(
      {
        files: {
          'docs/stories/story-12.md': '---\nid: STORY-12\nstatus: todo\n---\n# Accept PDFs\n',
          'docs/sprint-status.yaml': 'STORY-12:\n  status: done\n',
        },
      },
      now,
    )
    expect(result.tasks.find((t) => t.id === 'STORY-12')?.status).toBe('done')
  })

  it('maps an unknown status to backlog rather than guessing', () => {
    const result = importBmad(
      { files: { 'docs/stories/s-1.md': '---\nid: S-1\nstatus: marinating\n---\n# Thing\n' } },
      now,
    )
    expect(result.tasks[0]?.status).toBe('backlog')
  })

  it('warns that imported tasks cannot be dispatched as they are', () => {
    const result = importBmad({ files: { 'docs/epics/e-1.md': '---\nid: E-1\n---\n# Thing\n' } }, now)
    const note = result.notes.find((n) => n.includes('dispatched')) ?? ''
    expect(note).toContain('acceptance criteria')
    expect(note).toContain('1 task derived')
  })

  it('never produces two rows for one task', () => {
    // The same story appears in its own document and in the sprint status. Two rows is a
    // board that lies about how much work there is.
    const result = importBmad(
      {
        files: {
          'docs/sprint-status.yaml': 'STORY-12:\n  status: done\n',
          'docs/stories/story-12.md': '---\nid: STORY-12\nowner: dev-be\n---\n# Accept PDFs\n',
        },
      },
      now,
    )
    expect(result.tasks).toHaveLength(1)
    // The document knows the title and the owner; the sprint status knows the status.
    expect(result.tasks[0]?.title).toBe('Accept PDFs')
    expect(result.tasks[0]?.owner).toBe('dev-be')
    expect(result.tasks[0]?.status).toBe('done')
  })

  it('leaves files it does not understand alone, and counts them', () => {
    const result = importBmad(
      { files: { 'docs/prd.md': '# P\n', 'docs/notes/random.md': 'x', 'weird.txt': 'y' } },
      now,
    )
    expect(result.unrecognised).toHaveLength(2)
    expect(result.notes.some((n) => n.includes('left alone'))).toBe(true)
  })
})
