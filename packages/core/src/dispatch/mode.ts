import type { DispatchMode } from '../schema/common.js'

/**
 * Choosing how to start a department (ORCHESTRATION_SPEC section 2).
 *
 * Pure, because the rule is the interesting part and it depends on facts the caller
 * gathers: what kind of session this is, what the environment allows, and whether any
 * seat needs something a teammate cannot have.
 */

export interface DispatchFacts {
  /** What the user asked for, if anything. */
  requested?: DispatchMode | undefined
  /** Is this an interactive CLI session? Teams need one; `-p` never spawns teammates. */
  interactive: boolean
  /** Claude Desktop does not support Agent Teams at all. */
  surface: 'cli' | 'desktop' | 'vscode' | 'unknown'
  /** `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. */
  teamsEnabled: boolean
  /** Whether `claude --bg` can actually be launched from here. */
  canLaunchBackground: boolean
  /** The orchestrator effort level, which teammates inherit whether they like it or not. */
  leadEffort?: string | undefined
  /** Effort each seat is configured to want. */
  seatEfforts: Record<string, string | undefined>
  /** Work expected to outlive this session. */
  longRunning?: boolean
}

export interface DispatchDecision {
  mode: DispatchMode
  /** Why, in one line, for the journal and for the user. */
  reason: string
  /** Things the user should know about the choice. */
  notes: string[]
}

/** Seats whose configured effort differs from the lead — teammates cannot have their own. */
export function seatsNeedingOwnEffort(facts: DispatchFacts): string[] {
  if (!facts.leadEffort) return []
  return Object.entries(facts.seatEfforts)
    .filter(([seat, effort]) => seat !== 'orchestrator' && effort && effort !== facts.leadEffort)
    .map(([seat]) => seat)
}

/**
 * Pick a mode.
 *
 * The order matters, and each step is a fact rather than a preference:
 * an explicit request wins; teams need an interactive CLI session with the experiment
 * enabled and no seat wanting its own effort; background sessions need to be launchable;
 * and manual always works, which is why it is last.
 */
export function chooseDispatchMode(facts: DispatchFacts): DispatchDecision {
  const notes: string[] = []

  if (facts.requested && facts.requested !== 'auto') {
    const blockers = blockersFor(facts.requested, facts)
    for (const blocker of blockers) notes.push(blocker)
    return {
      mode: facts.requested,
      reason: `you asked for ${facts.requested}`,
      notes,
    }
  }

  const ownEffort = seatsNeedingOwnEffort(facts)

  if (facts.surface === 'cli' && facts.interactive && facts.teamsEnabled && ownEffort.length === 0) {
    if (facts.longRunning && facts.canLaunchBackground) {
      return {
        mode: 'sessions',
        reason: 'this work outlives the session, and teammates do not survive it',
        notes,
      }
    }
    return { mode: 'teams', reason: 'interactive CLI session with Agent Teams enabled', notes }
  }

  if (facts.canLaunchBackground) {
    return { mode: 'sessions', reason: whyNotTeams(facts, ownEffort), notes }
  }

  notes.push('you will be given the exact lines to paste into each new session')
  return { mode: 'manual', reason: whyNotTeams(facts, ownEffort), notes }
}

function whyNotTeams(facts: DispatchFacts, ownEffort: string[]): string {
  if (ownEffort.length > 0) {
    return `${ownEffort.join(' and ')} need an effort level of their own, which a teammate cannot have`
  }
  if (facts.surface === 'desktop') return 'Agent Teams is not available in Claude Desktop'
  if (facts.surface === 'vscode') return 'this is the VS Code extension, not an interactive CLI session'
  if (!facts.interactive) return 'teammates are never spawned from a non-interactive session'
  if (!facts.teamsEnabled) return 'Agent Teams is not enabled (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1)'
  return 'Agent Teams is unavailable here'
}

/** What would go wrong if the user insists on a mode this environment cannot support. */
function blockersFor(mode: DispatchMode, facts: DispatchFacts): string[] {
  const notes: string[] = []
  if (mode === 'teams') {
    if (!facts.teamsEnabled)
      notes.push('Agent Teams is not enabled; set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1')
    if (facts.surface === 'desktop') notes.push('Agent Teams is not available in Claude Desktop')
    if (!facts.interactive) notes.push('teammates are never spawned from a non-interactive session')
    const ownEffort = seatsNeedingOwnEffort(facts)
    if (ownEffort.length > 0) {
      notes.push(
        `${ownEffort.join(', ')} will run at the orchestrator effort level, not their own: ` +
          'teammates inherit it',
      )
    }
  }
  if (mode === 'sessions' && !facts.canLaunchBackground) {
    notes.push('background sessions cannot be launched from here')
  }
  return notes
}
