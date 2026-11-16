import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function failed(p0: string | number, locale?: ModelLocale) {
  return L({ ko: `(오류: ${p0})`, en: `(Error: ${p0})` }, locale)
}

export function paused(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `(확인 필요: ${p0} 편집이 적용됐을 수 있습니다. 문서에서 확인한 뒤 다시 요청하세요.)`,
      en: `(Needs attention: ${p0} The edit may have been applied. Check the document before requesting again.)`,
    },
    locale,
  )
}

export function resolveTimeout(locale?: ModelLocale) {
  return L(
    { ko: '편집 대상 확인 시간 초과', en: 'Edit target resolution timed out' },
    locale,
  )
}

export function existingOnly(locale?: ModelLocale) {
  return L(
    {
      ko: '작업본 편집은 이미 있는 문서에만 할 수 있습니다.',
      en: 'Working copy edits are available only for existing documents.',
    },
    locale,
  )
}

export function invalidPath(locale?: ModelLocale) {
  return L(
    {
      ko: '편집 대상 경로가 Vault 경로 형식이 아닙니다.',
      en: 'The edit target path is not in Vault path format.',
    },
    locale,
  )
}

export function resolveFailed(locale?: ModelLocale) {
  return L(
    {
      ko: '편집 대상을 확인하지 못했습니다.',
      en: 'Could not identify the edit target.',
    },
    locale,
  )
}

export function cancelled(locale?: ModelLocale) {
  return L(
    {
      ko: '플러그인 도구 호출이 취소됐습니다.',
      en: 'The plugin tool call was cancelled.',
    },
    locale,
  )
}

export function rejected(p0: string | number, locale?: ModelLocale) {
  return L({ ko: `(거절: ${p0})`, en: `(Rejected: ${p0})` }, locale)
}

export function approvalUnavailable(locale?: ModelLocale) {
  return L(
    {
      ko: '편집 승인 화면을 사용할 수 없어 편집하지 않았습니다.',
      en: 'No edit was made because the edit approval screen is unavailable.',
    },
    locale,
  )
}

export function userRejected(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `사용자가 ${p0} 작업본 편집을 허용하지 않았습니다. 편집하지 않았습니다.`,
      en: `The user did not allow editing the working copy of ${p0}. No edit was made.`,
    },
    locale,
  )
}

export function busy(locale?: ModelLocale) {
  return L(
    {
      ko: '같은 플러그인의 이전 호출이 아직 끝나지 않았습니다.',
      en: 'The previous call to the same plugin has not finished yet.',
    },
    locale,
  )
}

export function ownershipChanged(locale?: ModelLocale) {
  return L(
    {
      ko: '문서 소유권이 바뀌었습니다.',
      en: 'Document ownership has changed.',
    },
    locale,
  )
}

export function revoked(locale?: ModelLocale) {
  return L(
    {
      ko: '편집 권한이 철회됐거나 호출이 취소됐습니다.',
      en: 'Edit permission was revoked or the call was cancelled.',
    },
    locale,
  )
}

export function noResult(locale?: ModelLocale) {
  return L(
    {
      ko: '플러그인이 편집 결과를 돌려주지 않았습니다.',
      en: 'The plugin did not return the edit result.',
    },
    locale,
  )
}

export function changedDuringCall(locale?: ModelLocale) {
  return L(
    {
      ko: '호출 중 플러그인이 변경됐거나 편집 권한이 철회됐습니다.',
      en: 'The plugin changed or edit permission was revoked during the call.',
    },
    locale,
  )
}

export function wrongTarget(locale?: ModelLocale) {
  return L(
    {
      ko: '플러그인이 승인한 문서와 다른 대상을 보고했습니다.',
      en: 'The plugin reported a target different from the approved document.',
    },
    locale,
  )
}

export function planningMismatch(locale?: ModelLocale) {
  return L(
    {
      ko: '문서 계획의 무변경 영수증이 고정된 대상과 모순됩니다.',
      en: 'The no-change receipt for the document plan contradicts the pinned target.',
    },
    locale,
  )
}

export function unconfirmed(locale?: ModelLocale) {
  return L(
    {
      ko: '플러그인이 편집 적용 여부를 확정하지 못했습니다.',
      en: 'The plugin could not confirm whether the edit was applied.',
    },
    locale,
  )
}

export function invalidReceipt(locale?: ModelLocale) {
  return L(
    {
      ko: '플러그인의 편집 결과 형식이 계약과 다릅니다.',
      en: 'The plugin edit result format does not match the contract.',
    },
    locale,
  )
}

export function changedDuringReadback(locale?: ModelLocale) {
  return L(
    {
      ko: '결과 확인 중 플러그인이 변경됐거나 편집 권한이 철회됐습니다.',
      en: 'The plugin changed or edit permission was revoked while checking the result.',
    },
    locale,
  )
}
