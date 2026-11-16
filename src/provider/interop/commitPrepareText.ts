import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function failed(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `(오류: ${p0} 파일은 바뀌지 않았습니다.)`,
      en: `(Error: ${p0} Files have not changed.)`,
    },
    locale,
  )
}

export function unavailable(locale?: ModelLocale) {
  return L(
    {
      ko: '이 플러그인은 지금 파일 저장을 할 수 없습니다.',
      en: 'This plugin cannot save files right now.',
    },
    locale,
  )
}

export function runRequired(locale?: ModelLocale) {
  return L(
    {
      ko: '저장은 진행 중인 실행 안에서만 할 수 있습니다.',
      en: 'Saving is available only within an active run.',
    },
    locale,
  )
}

export function resolveTimeout(locale?: ModelLocale) {
  return L(
    { ko: '저장 대상 확인 시간 초과', en: 'Save target resolution timed out' },
    locale,
  )
}

export function invalidPath(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 대상 경로가 Vault 경로 형식이 아닙니다.',
      en: 'The save target path is not in Vault path format.',
    },
    locale,
  )
}

export function resolveFailed(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 대상을 확인하지 못했습니다.',
      en: 'Could not identify the save target.',
    },
    locale,
  )
}

export function cancelled(locale?: ModelLocale) {
  return L(
    { ko: '저장 요청이 취소됐습니다.', en: 'The save request was cancelled.' },
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

export function prepareFailed(locale?: ModelLocale) {
  return L(
    { ko: '저장을 준비하지 못했습니다.', en: 'Could not prepare the save.' },
    locale,
  )
}

export function changed(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `저장을 준비한 뒤 ${p0}이(가) 바뀌었습니다. 다시 저장을 요청하세요.`,
      en: `${p0} changed after the save was prepared. Request the save again.`,
    },
    locale,
  )
}

export function readFailed(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 대상 파일의 현재 상태를 읽지 못했습니다.',
      en: 'Could not read the current state of the save target file.',
    },
    locale,
  )
}

export function noChanges(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `[플러그인 저장 결과: ${p0}/${p1}]
${p2}은(는) 이미 저장된 상태입니다. 쓸 변경이 없습니다.`,
      en: `[Plugin save result: ${p0}/${p1}]
${p2} is already saved. There are no changes to write.`,
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
      ko: '저장 승인 화면을 사용할 수 없어 저장하지 않았습니다.',
      en: 'Nothing was saved because the save approval screen is unavailable.',
    },
    locale,
  )
}

export function userRejected(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `사용자가 ${p0} 저장을 허용하지 않았습니다. 저장하지 않았습니다.`,
      en: `The user did not allow saving ${p0}. Nothing was saved.`,
    },
    locale,
  )
}

export function expired(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 준비가 만료됐습니다. 다시 저장을 요청하세요.',
      en: 'The save preparation has expired. Request the save again.',
    },
    locale,
  )
}

export function changedDuringApproval(locale?: ModelLocale) {
  return L(
    {
      ko: '승인하는 동안 문서가 바뀌었습니다. 다시 저장을 요청하세요.',
      en: 'The document changed during approval. Request the save again.',
    },
    locale,
  )
}

export function recheckFailed(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 대상을 다시 확인하지 못했습니다.',
      en: 'Could not recheck the save target.',
    },
    locale,
  )
}
