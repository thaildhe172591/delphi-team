/**
 * Skills delphi shipped before every name carried the `delphi-` prefix.
 *
 * `resume` was the one that mattered: Claude Code has its own `/resume`, and a project skill
 * of the same name shadowed it — typing `/resume` ran delphi's, silently, which is the worst
 * kind of collision because nothing reports it. Prefixing only that one would have left you
 * guessing which of the six were which, so all six moved (C-019).
 *
 * An upgrade that writes the new names and leaves the old ones behind fixes nothing: the
 * project then has both, and `/resume` is still shadowed. So the old ones have to go.
 *
 * But `.claude/skills/` is a directory the user may have put their own skills in, and a
 * `resume` skill of their own would sit at exactly the path being removed. Deleting someone's
 * unrelated work while "upgrading" is not a trade worth making for a tidier directory, so a
 * file is only superseded when it is recognisably the one delphi shipped.
 */

export const RENAMED_SKILLS = ['checkpoint', 'dept', 'resume', 'role', 'seat', 'shift-end'] as const

/**
 * Is this the skill delphi used to ship under that name, rather than one of the user's?
 *
 * Two signals, both required: the frontmatter calls itself exactly what the directory is
 * called — which is what delphi's generator wrote — and the body runs a `delphi` command,
 * which a skill someone wrote for another purpose has no reason to do.
 */
export function isSupersededSkill(name: string, content: string): boolean {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1]
  if (!frontmatter) return false

  const declared = /^name:\s*(\S+)\s*$/m.exec(frontmatter)?.[1]
  if (declared !== name) return false

  // A command, not the word. delphi's skills run `delphi state` in a code span or start a
  // fenced line with `delphi checkpoint --note ...`; prose about "the delphi technique" does
  // neither, and a looser check took that for a command.
  return /(^|`)delphi\s+[a-z][a-z-]*/m.test(content)
}

/** The old skill directories in this project that delphi should take back. */
export function supersededSkills(existing: Record<string, string>): string[] {
  return RENAMED_SKILLS.filter((name) => {
    const content = existing[`.claude/skills/${name}/SKILL.md`]
    return content !== undefined && isSupersededSkill(name, content)
  })
}
