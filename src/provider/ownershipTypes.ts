import { L } from '../i18n/modelText'

import type { ProviderCurrentCause } from './interop/currentProvider'
import type { OpenDocumentRef } from './interop/sessionProtocol'

export type DocumentOwner = OpenDocumentRef & { providerId: string }
export type UnverifiableProvider = {
  providerId: string
  cause: ProviderCurrentCause
}
export type OwnershipQueryResult = {
  documents: DocumentOwner[]
  unverifiable: UnverifiableProvider[]
}
export type OwnershipOptions = { newOutput?: true }
export const ownershipKey = (path: string) =>
  path.replace(/\\/g, '/').toLowerCase().normalize('NFC')

export const providerRecoveryActions = (): Record<
  ProviderCurrentCause,
  string
> =>
  L({
    ko: {
      pending:
        'Verbex 설정 › 도구 관리 › 도구 승인에서 해당 플러그인을 승인하세요.',
      reapproval:
        'Verbex 설정 › 도구 관리 › 도구 승인에서 해당 플러그인을 재승인하세요.',
      disabled:
        'Verbex 설정에서 다시 승인하거나, 쓰지 않으면 Obsidian 커뮤니티 플러그인에서 플러그인 자체를 끄세요. Verbex 쪽 끄기만으로는 확인 불가 상태가 남습니다.',
      artifact_unverified:
        'Obsidian을 다시 시작하세요. 계속되면 Verbex 설정 › 도구 관리 › 도구 승인에서 다시 승인하세요.',
      status_error:
        '해당 플러그인을 다시 불러오세요. 승인 기록이 중복되었다면 설정을 정리하세요.',
      instance_changed:
        '해당 플러그인을 다시 불러오세요. 승인 기록이 중복되었다면 설정을 정리하세요.',
    },
    en: {
      pending:
        'Approve the plugin in Verbex settings › Tool management › Tool approval.',
      reapproval:
        'Reapprove the plugin in Verbex settings › Tool management › Tool approval.',
      disabled:
        'Reapprove it in Verbex settings, or disable the plugin itself in Obsidian Community plugins if unused. Disabling it only in Verbex leaves its state unverifiable.',
      artifact_unverified:
        'Restart Obsidian. If this persists, reapprove it in Verbex settings › Tool management › Tool approval.',
      status_error:
        'Reload the plugin. If approval records are duplicated, clean up the settings.',
      instance_changed:
        'Reload the plugin. If approval records are duplicated, clean up the settings.',
    },
  })

export class OwnershipUnverifiableError extends Error {
  readonly code = 'ownership_unverifiable'
  readonly retryable = false
  constructor(
    readonly unverifiable: readonly UnverifiableProvider[],
    providerName: (id: string) => string | undefined = () => undefined,
  ) {
    super(
      L({
        ko: `열린 문서의 소유권을 확인할 수 없습니다. ${unverifiable.map(({ providerId, cause }) => `${providerName(providerId) ?? providerId} (${cause}): ${providerRecoveryActions()[cause]}`).join(' ')} 같은 요청을 다시 보내도 결과가 같습니다. 새 파일 만들기는 영향을 받지 않습니다.`,
        en: `Cannot verify ownership of open documents. ${unverifiable.map(({ providerId, cause }) => `${providerName(providerId) ?? providerId} (${cause}): ${providerRecoveryActions()[cause]}`).join(' ')} Sending the same request again will produce the same result. Creating new files is unaffected.`,
      }),
    )
    this.name = 'OwnershipUnverifiableError'
  }
}

export const ownershipRetryable = (error: unknown, fallback: boolean) =>
  error instanceof OwnershipUnverifiableError ? error.retryable : fallback

/** Keep every recovery action; preserve the existing cap for other errors. */
export const ownershipErrorText = (
  error: unknown,
  fallback: string,
  limit: number,
): string =>
  error instanceof OwnershipUnverifiableError
    ? error.message
    : error instanceof Error && error.message
      ? error.message.slice(0, limit)
      : fallback
