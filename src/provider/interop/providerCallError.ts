import { L } from '../../i18n/modelText'

export function providerCallCancelled() {
  return L({
    ko: '플러그인 도구 호출이 취소됐습니다.',
    en: 'The plugin tool call was cancelled.',
  })
}

export function providerCallTimedOut() {
  return L({
    ko: '플러그인 도구 응답 시간 초과. 대상 작업은 계속 실행 중일 수 있습니다.',
    en: 'The plugin tool response timed out. The target operation may still be running.',
  })
}

/** The host stopped waiting; the provider may still be working. */
export class ProviderCallInterrupted extends Error {
  constructor(
    message: string,
    readonly reason: 'busy' | 'timeout' | 'cancelled' = 'cancelled',
  ) {
    super(message)
  }
}

export function assertProviderCallAvailable(
  signal: AbortSignal | undefined,
  busy: Set<string>,
  providerId: string,
): void {
  if (signal?.aborted)
    throw new ProviderCallInterrupted(providerCallCancelled())
  if (busy.has(providerId))
    throw new ProviderCallInterrupted(
      L({
        ko: '같은 플러그인의 이전 호출이 아직 끝나지 않았습니다.',
        en: 'The previous call to the same plugin has not finished yet.',
      }),
      'busy',
    )
}
