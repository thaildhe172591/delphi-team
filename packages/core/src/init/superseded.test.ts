import { describe, expect, it } from 'vitest'
import { isSupersededSkill, RENAMED_SKILLS, supersededSkills } from './superseded.js'

/**
 * The upgrade that takes the old skill names back.
 *
 * `resume` shadowed Claude Code's own `/resume`, so all six were prefixed. Writing the new
 * names and leaving the old ones behind would fix nothing — the project would have both and
 * `/resume` would still be shadowed — so an upgrade removes them.
 *
 * Removing a directory during an upgrade is the dangerous half. `.claude/skills/` is where a
 * user's own skills live too, and a `resume` of their own sits at exactly the path being
 * deleted. These tests are mostly about what is *not* taken.
 */

const delphiSkill = (name: string) =>
  [
    '---',
    `name: ${name}`,
    'description: Something delphi shipped.',
    '---',
    '',
    'Run `delphi state` first.',
  ].join('\n')

describe('recognising a skill delphi shipped', () => {
  it('takes back the one it wrote', () => {
    expect(isSupersededSkill('resume', delphiSkill('resume'))).toBe(true)
  })

  it('leaves a skill of the user own, even at the same path', () => {
    // Someone's own `resume` skill, about resuming a deployment. Deleting it while
    // "upgrading" is not a trade worth making for a tidier directory.
    const theirs = [
      '---',
      'name: resume',
      'description: Resume a paused deployment.',
      '---',
      '',
      'Run `kubectl rollout resume`.',
    ].join('\n')
    expect(isSupersededSkill('resume', theirs)).toBe(false)
  })

  it('leaves a delphi skill the user renamed, because the name no longer matches', () => {
    expect(isSupersededSkill('resume', delphiSkill('my-resume'))).toBe(false)
  })

  it('leaves a file with no frontmatter alone', () => {
    expect(isSupersededSkill('resume', '# Resume\n\nRun `delphi state`.')).toBe(false)
  })

  it('takes back one whose command is a fenced line rather than a code span', () => {
    // `checkpoint` and `resume` write theirs this way, with no backticks at all.
    const fenced = [
      '---',
      'name: checkpoint',
      'description: Save a restore point.',
      '---',
      '',
      '```bash',
      'delphi checkpoint --note "$ARGUMENTS"',
      '```',
    ].join('\n')
    expect(isSupersededSkill('checkpoint', fenced)).toBe(true)
  })

  it('is not fooled by the word delphi in prose', () => {
    const prose = [
      '---',
      'name: resume',
      'description: About the delphi method of forecasting.',
      '---',
      '',
      'The delphi technique is a forecasting method.',
    ].join('\n')
    expect(isSupersededSkill('resume', prose)).toBe(false)
  })
})

describe('what an upgrade takes back', () => {
  it('finds every old name that is present and delphi own', () => {
    const existing = Object.fromEntries(
      RENAMED_SKILLS.map((name) => [`.claude/skills/${name}/SKILL.md`, delphiSkill(name)]),
    )
    expect(supersededSkills(existing)).toEqual([...RENAMED_SKILLS])
  })

  it('takes nothing from a project that never had them', () => {
    expect(supersededSkills({})).toEqual([])
  })

  it('never touches the prefixed ones it just wrote', () => {
    const existing = {
      '.claude/skills/delphi-resume/SKILL.md': delphiSkill('delphi-resume'),
      '.claude/skills/delphi-dept/SKILL.md': delphiSkill('delphi-dept'),
    }
    expect(supersededSkills(existing)).toEqual([])
  })
})
