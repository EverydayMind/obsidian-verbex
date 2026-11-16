export type StartupDiagnosticFields = Record<string, unknown>

export function logStartupDiagnostic(record: StartupDiagnosticFields): void {
  let serialized: string
  try {
    serialized = JSON.stringify(record)
  } catch (error) {
    // Diagnostics must never become a new startup failure (for example when
    // a future field contains a circular value or BigInt).
    serialized = JSON.stringify({
      event: typeof record.event === 'string' ? record.event : 'unknown',
      serializationError: errorMessage(error),
    })
  }
  console.debug('[Verbex][startup]', serialized)
}

function now(): number {
  if (
    typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
  ) {
    return performance.now()
  }
  return Date.now()
}

function durationMs(startedAt: number): number {
  return Math.round((now() - startedAt) * 100) / 100
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Short-lived startup instrumentation. It intentionally stops after one
 * diagnostic window so normal runtime indexing does not become noisy.
 */
export class StartupDiagnostics {
  private readonly startedAt = now()
  private active = true
  private summaryTimer: ReturnType<typeof setTimeout> | null = null
  private readonly counters = new Map<string, number>()

  mark(event: string, fields: StartupDiagnosticFields = {}): void {
    if (!this.active) return
    const record = {
      event,
      elapsedMs: durationMs(this.startedAt),
      ...fields,
    }
    // Some persistent console collectors flatten object arguments to
    // "[object Object]", which hides the stage that was reached during an
    // early-startup failure.
    logStartupDiagnostic(record)
  }

  count(counter: string, amount = 1): void {
    if (!this.active) return
    this.counters.set(counter, (this.counters.get(counter) ?? 0) + amount)
  }

  async measure<T>(
    stage: string,
    operation: () => Promise<T> | T,
    fields: StartupDiagnosticFields = {},
  ): Promise<T> {
    if (!this.active) return await operation()

    const startedAt = now()
    this.mark('stage:start', { stage, ...fields })
    try {
      const result = await operation()
      this.mark('stage:end', {
        stage,
        durationMs: durationMs(startedAt),
        ok: true,
        ...fields,
      })
      return result
    } catch (error) {
      this.mark('stage:end', {
        stage,
        durationMs: durationMs(startedAt),
        ok: false,
        error: errorMessage(error),
        ...fields,
      })
      throw error
    }
  }

  scheduleSummary(
    fields: StartupDiagnosticFields | (() => StartupDiagnosticFields) = {},
    delayMs = 30_000,
  ): void {
    if (this.summaryTimer) clearTimeout(this.summaryTimer)
    this.summaryTimer = setTimeout(() => {
      const resolvedFields = typeof fields === 'function' ? fields() : fields
      this.finish(resolvedFields)
    }, delayMs)
  }

  finish(fields: StartupDiagnosticFields = {}): void {
    if (!this.active) return
    this.mark('summary', {
      durationMs: durationMs(this.startedAt),
      counters: Object.fromEntries(this.counters),
      ...fields,
    })
    this.active = false
    if (this.summaryTimer) {
      clearTimeout(this.summaryTimer)
      this.summaryTimer = null
    }
  }

  dispose(): void {
    this.finish({ reason: 'unload' })
  }
}
