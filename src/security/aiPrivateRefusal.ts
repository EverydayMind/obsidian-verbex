import { type AgentToolOutcome, toolFailed } from '../core/llm/toolOutcome'

import {
  aiPrivateRefusalText,
  asVaultPath,
  isAiPrivatePath,
} from './aiPrivatePaths'

// The native argument snapshot allows depth 12 and 5,000 nodes.
const MAX_DEPTH = 12
const MAX_VALUES = 5000
const MAX_PATH_CHARS = 1024

/** Thrown at a read point that has no result channel of its own. */
export class AiPrivateReadError extends Error {
  constructor(readonly path: string) {
    super(aiPrivateRefusalText())
    this.name = 'AiPrivateReadError'
  }
}

export function assertNotAiPrivate(path: string): void {
  if (isAiPrivatePath(path)) throw new AiPrivateReadError(path)
}

/** Wraps a path validator so a private path is refused like an invalid one. */
export function refusingAiPrivate(
  validate: (path: string) => string,
): (path: string) => string {
  return (path) => {
    const valid = validate(path)
    assertNotAiPrivate(valid)
    return valid
  }
}

/**
 * A refusal decided before anything was read or run: nothing changed, and the
 * same call cannot succeed until the user removes the mark in HWP Hands.
 */
export function aiPrivateRefusalOutcome(path?: string): AgentToolOutcome {
  return toolFailed(
    path ? `${aiPrivateRefusalText()} (${path})` : aiPrivateRefusalText(),
    { terminal: false, retry: { allowed: false }, mutationScope: 'none' },
  )
}

/** The refusal for an escaped private read, or undefined for another error. */
export function aiPrivateErrorOutcome(
  error: unknown,
): AgentToolOutcome | undefined {
  return error instanceof AiPrivateReadError
    ? aiPrivateRefusalOutcome(error.path)
    : undefined
}

/**
 * Outermost converting catch of one tool call: a private read refused deep in
 * a tool that has no result channel of its own still ends as the refusal.
 */
export async function refusingAiPrivateRead(
  work: () => Promise<AgentToolOutcome>,
): Promise<AgentToolOutcome> {
  try {
    return await work()
  } catch (error) {
    const refusal = aiPrivateErrorOutcome(error)
    if (refusal) return refusal
    throw error
  }
}

/**
 * The first argument value that IS an AI-private vault path. Only a whole
 * string value matches; a path mentioned inside longer text does not. The walk
 * is bounded, and argument names are not consulted.
 */
export function findAiPrivateArg(args: unknown): string | null {
  let seen = 0
  const walk = (value: unknown, depth: number): string | null => {
    if (seen++ >= MAX_VALUES || depth > MAX_DEPTH) return null
    if (typeof value === 'string') {
      if (!value || value.length > MAX_PATH_CHARS) return null
      const path = asVaultPath(value)
      return path && isAiPrivatePath(path) ? path : null
    }
    if (!value || typeof value !== 'object') return null
    for (const item of Array.isArray(value)
      ? (value as unknown[])
      : Object.values(value as Record<string, unknown>)) {
      const hit = walk(item, depth + 1)
      if (hit) return hit
    }
    return null
  }
  return walk(args, 0)
}

/** For a host-run call with no result channel: throws at a private argument. */
export function assertNoAiPrivateArg(args: unknown): void {
  const path = findAiPrivateArg(args)
  if (path) throw new AiPrivateReadError(path)
}
