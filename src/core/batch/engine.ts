export type BatchStateAuthority = 'checklist' | 'jobstore'

export type BatchEnginePhase<State> = {
  state: State
  completionCalls: number
  interrupted: boolean
}

export type BatchEngineAtomicPhase<State, Value> = BatchEnginePhase<State> & {
  value: Value
}

export type BatchJobEngineInput<State, AtomicValue> = {
  stateAuthority: BatchStateAuthority
  initialState: State
  /** Cancels between packed and atomic phases. */
  signal?: AbortSignal
  /** Optional packed phase; failures must leave declined atoms pending. */
  runPacked?: (state: State) => Promise<BatchEnginePhase<State>>
  /** Required atom-level fallback that owns terminal state transitions. */
  runAtomic: (
    state: State,
  ) => Promise<BatchEngineAtomicPhase<State, AtomicValue>>
}

export type BatchJobEngineResult<State, AtomicValue> = {
  stateAuthority: BatchStateAuthority
  state: State
  atomic: AtomicValue
  completionCalls: number
  interrupted: boolean
}

export type BatchQuota = {
  maxCompletionCalls: number
  maxElapsedMs: number
  startedAtMs?: number
  nowMs?: () => number
}

export type QuotaBoundedRunResult = {
  completed: number
  completionCalls: number
  pausedByQuota: boolean
}

/** Execute only at item/pack boundaries; never pauses halfway through an item. */
export async function runQuotaBoundedItems<T>(input: {
  items: T[]
  quota: BatchQuota
  execute: (item: T, index: number) => Promise<number | undefined>
}): Promise<QuotaBoundedRunResult> {
  const now = input.quota.nowMs ?? Date.now
  const started = input.quota.startedAtMs ?? now()
  let completed = 0
  let completionCalls = 0
  for (let index = 0; index < input.items.length; index++) {
    const callsExhausted =
      input.quota.maxCompletionCalls > 0 &&
      completionCalls >= input.quota.maxCompletionCalls
    const timeExhausted =
      input.quota.maxElapsedMs > 0 &&
      now() - started >= input.quota.maxElapsedMs
    if (callsExhausted || timeExhausted) {
      return { completed, completionCalls, pausedByQuota: true }
    }
    completionCalls += (await input.execute(input.items[index], index)) ?? 1
    completed += 1
  }
  return { completed, completionCalls, pausedByQuota: false }
}

/**
 * Common orchestration skeleton extracted from the treaty controller wiring.
 * Adapters still own rendering, verification, and commits; the engine fixes the
 * phase order and guarantees that every pack-declined atom reaches the atomic
 * fallback. State authority is explicit so checklist-backed treaty jobs are not
 * silently converted to JobStore authority.
 */
export async function runBatchJobEngine<State, AtomicValue>(
  input: BatchJobEngineInput<State, AtomicValue>,
): Promise<BatchJobEngineResult<State, AtomicValue>> {
  const throwIfAborted = (): void => {
    if (input.signal?.aborted)
      throw new DOMException('Operation aborted', 'AbortError')
  }
  throwIfAborted()
  let state = input.initialState
  let completionCalls = 0
  let interrupted = false
  if (input.runPacked) {
    const packed = await input.runPacked(state)
    throwIfAborted()
    state = packed.state
    completionCalls += packed.completionCalls
    interrupted ||= packed.interrupted
  }
  throwIfAborted()
  const atomic = await input.runAtomic(state)
  throwIfAborted()
  state = atomic.state
  completionCalls += atomic.completionCalls
  interrupted ||= atomic.interrupted
  return {
    stateAuthority: input.stateAuthority,
    state,
    atomic: atomic.value,
    completionCalls,
    interrupted,
  }
}
