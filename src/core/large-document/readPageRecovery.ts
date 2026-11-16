import { L } from '../../i18n/modelText'
import { createHash } from '../../platform/node/api'
import { AgentToolOutcome, toolFailed } from '../llm/toolOutcome'

export type ReadPageRecovery = {
  tool: string
  paths: string[]
  revision?: string
  start: Record<string, string | number | number[]>
  rangeArguments: string[]
}

/** Run-local bounded failure ledger, independent of model prose and next cursor. */
export class ReadPageRecoveryLedger {
  private failures = new Map<string, number>()
  private key(outcome: AgentToolOutcome): string {
    const recovery = outcome.readPage?.recovery
    return createHash('sha256')
      .update(
        JSON.stringify(
          recovery
            ? {
                tool: recovery.tool,
                paths: recovery.paths,
                revision: recovery.revision,
                start: recovery.start,
              }
            : { paths: outcome.evidence?.paths, text: outcome.readPage?.text },
        ),
      )
      .digest('hex')
  }
  exhausted(outcome: AgentToolOutcome): boolean {
    return (this.failures.get(this.key(outcome)) ?? 0) >= 2
  }
  succeeded(outcome: AgentToolOutcome): void {
    this.failures.delete(this.key(outcome))
  }
  failure(outcome: AgentToolOutcome, attempted = true): AgentToolOutcome {
    const key = this.key(outcome)
    const attempts = (this.failures.get(key) ?? 0) + Number(attempted)
    if (this.failures.size >= 128 && !this.failures.has(key)) {
      const first = [...this.failures.keys()][0]
      if (first !== undefined) this.failures.delete(first)
    }
    this.failures.set(key, attempts)
    const recovery = outcome.readPage?.recovery
    const allowed = !!recovery?.rangeArguments.length && attempts < 2
    const retry = {
      attempts,
      maxAttempts: 2,
      processedCoverage: 'none',
      recovery,
      allowed,
    }
    return toolFailed(
      L({
        ko: `현재 구간 요약 실패. 원문은 전송하지 않았으며 이 구간의 coverage는 없습니다. ${allowed ? '같은 시작 위치에서 지원되는 범위 인자로 더 작은 구간을 요청하세요.' : '지원되는 범위 읽기로 새로 탐색하거나 여기서 종료하세요. 동일 위치 자동 재시도는 중단합니다.'}\n${JSON.stringify(retry)}`,
        en: `Failed to summarize the current range. The original text was not sent and there is no coverage for this range. ${allowed ? 'Request a smaller range from the same starting position using supported range arguments.' : 'Explore again using supported range reads or stop here. Automatic retries at the same position are stopped.'}\n${JSON.stringify(retry)}`,
      }),
      {
        terminal: !allowed,
        mutationScope: 'none',
        disclosure: outcome.disclosure,
        documentRead: outcome.documentRead
          ? { ...outcome.documentRead, state: 'unavailable' }
          : undefined,
        readRecovery: retry,
        retry: {
          allowed,
          hint: allowed
            ? `Use supported arguments: ${recovery?.rangeArguments.join(', ') ?? ''}`
            : 'No automatic retry.',
        },
      },
    )
  }
}
