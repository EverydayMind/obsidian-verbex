import { type AgentToolOutcome, toolFailed } from '../../core/llm/toolOutcome'
import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'

import { ProviderCallInterrupted } from './providerCallError'
import type { NativeCall } from './readExecution'

export function lateReadDiscarded() {
  return L({
    ko: '취소 뒤에 도착한 결과를 버렸습니다.',
    en: 'Discarded a result received after cancellation.',
  })
}

export function discardedReadOutcome(
  call: NativeCall,
  message: string,
  affects: (path: string) => boolean,
): AgentToolOutcome {
  call.ctx.snapshot?.observations?.invalidateRepeatedRead()
  const outcome = toolFailed(`${modelMarker('toolError')} ${message})`, {
    terminal: false,
    retry: { allowed: false },
    mutationScope: 'none',
  })
  if (typeof call.args.path === 'string') {
    try {
      const target = call.vaultPath(call.args.path)
      if (affects(target)) outcome.invalidatedReadTarget = target
    } catch {
      // A rejected target is not stored in the read ledger.
    }
  }
  return outcome
}

/** Invalidate the target after interruption or an observed change before failure. */
export function interruptedReadOutcome(
  call: NativeCall,
  error: unknown,
  changes: { affects(path: string): boolean; hasChanges(): boolean },
): AgentToolOutcome {
  call.ctx.snapshot?.observations?.invalidateRepeatedRead()
  const changed = changes.hasChanges()
  let target: string | undefined
  try {
    if (typeof call.args.path === 'string')
      target = call.vaultPath(call.args.path)
  } catch {
    // A rejected target is not stored in the read ledger.
  }
  const interrupted =
    error instanceof ProviderCallInterrupted && error.reason !== 'busy'
  if (!changed && (!target || !interrupted)) throw error
  return {
    ...toolFailed(
      `${modelMarker('toolError')} ${interrupted ? error.message : L({ ko: '플러그인 읽기 호출이 실패했습니다.', en: 'The plugin read call failed.' })})${changed ? L({ ko: '\n호출 중 Vault 변경 관측, 원인 미확정. 읽기 근거는 확정하지 않았습니다.', en: '\nVault changes were observed during the call; their cause is undetermined. Read evidence was not confirmed.' }) : ''}`,
      {
        terminal: false,
        retry: { allowed: false },
        mutationScope: 'none',
      },
    ),
    ...(target && (interrupted || changes.affects(target))
      ? { invalidatedReadTarget: target }
      : {}),
    evidence: { role: 'none', paths: [] },
  }
}
