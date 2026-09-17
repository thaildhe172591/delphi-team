import { join } from 'node:path'

/**
 * Where everything lives (MEMORY_SPEC section 2). One place builds these paths so a
 * rename is a one-line change rather than a grep across the codebase.
 */
export class LedgerPaths {
  constructor(readonly projectRoot: string) {}

  get delphi(): string {
    return join(this.projectRoot, '.delphi')
  }

  get protocol(): string {
    return join(this.delphi, 'PROTOCOL.md')
  }

  get config(): string {
    return join(this.delphi, 'config.yaml')
  }

  get index(): string {
    return join(this.delphi, 'index.yaml')
  }

  get logs(): string {
    return join(this.delphi, 'logs')
  }

  get assets(): string {
    return join(this.delphi, 'assets')
  }

  get teams(): string {
    return join(this.delphi, 'teams')
  }

  get capabilities(): string {
    return join(this.delphi, 'capabilities')
  }

  get roles(): string {
    return join(this.delphi, 'roles')
  }

  get agents(): string {
    return join(this.projectRoot, '.claude', 'agents')
  }

  agent(seat: string): string {
    return join(this.agents, `${seat}.md`)
  }

  project(slug: string): ProjectPaths {
    return new ProjectPaths(join(this.delphi, 'projects', slug))
  }
}

export class ProjectPaths {
  constructor(readonly root: string) {}

  get brief(): string {
    return join(this.root, 'BRIEF.md')
  }

  get state(): string {
    return join(this.root, 'STATE.md')
  }

  get journal(): string {
    return join(this.root, 'JOURNAL.md')
  }

  get decisions(): string {
    return join(this.root, 'DECISIONS.md')
  }

  get board(): string {
    return join(this.root, 'board.yaml')
  }

  get team(): string {
    return join(this.root, 'team.yaml')
  }

  /** Dispatch history: delphi records the model, effort and agent that `claude agents --json` cannot report back. */
  get sessions(): string {
    return join(this.root, 'sessions.log')
  }

  story(id: string): string {
    return join(this.root, 'stories', `${id}.md`)
  }

  report(seat: string, id: string, n: number): string {
    return join(this.root, 'reports', seat, `${id}-${n}.md`)
  }

  reportsFor(seat: string): string {
    return join(this.root, 'reports', seat)
  }

  inbox(seat: string): string {
    return join(this.root, 'inbox', seat)
  }

  knowledge(seat: string): string {
    return join(this.root, 'knowledge', `${seat}.md`)
  }

  get checkpoints(): string {
    return join(this.root, 'checkpoints')
  }

  get handoffs(): string {
    return join(this.root, 'handoffs')
  }
}
