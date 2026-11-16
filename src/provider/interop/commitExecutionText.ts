import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function pending(locale?: ModelLocale) {
  return L({ ko: '확인 안 됨', en: 'Not checked' }, locale)
}

export function written(locale?: ModelLocale) {
  return L({ ko: '저장됨', en: 'Saved' }, locale)
}

export function unchanged(locale?: ModelLocale) {
  return L({ ko: '변경 없음', en: 'No changes' }, locale)
}

export function notWritten(locale?: ModelLocale) {
  return L({ ko: '저장 안 됨', en: 'Not saved' }, locale)
}

export function unknown(locale?: ModelLocale) {
  return L(
    {
      ko: '확인 안 됨(예상과 다른 내용)',
      en: 'Not checked (unexpected content)',
    },
    locale,
  )
}

export function paused(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `(확인 필요: ${p0} 자동으로 다시 저장하지 않습니다.)`,
      en: `(Needs attention: ${p0} Saving will not be retried automatically.)`,
    },
    locale,
  )
}

export function missingFile(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 대상 파일이 사라졌습니다.',
      en: 'The destination file has disappeared.',
    },
    locale,
  )
}

export function checkpointError(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `되돌리기용 체크포인트를 만들지 못해 저장하지 않았습니다(${p0}).`,
      en: `Nothing was saved because a rollback checkpoint could not be created (${p0}).`,
    },
    locale,
  )
}

export function unknownCause(locale?: ModelLocale) {
  return L({ ko: '원인 미상', en: 'Unknown cause' }, locale)
}

export function linkError(locale?: ModelLocale) {
  return L(
    {
      ko: '체크포인트를 실행 기록에 연결하지 못해 저장하지 않았습니다.',
      en: 'Nothing was saved because the checkpoint could not be linked to the run record.',
    },
    locale,
  )
}

export function changedDuringCheckpoint(locale?: ModelLocale) {
  return L(
    {
      ko: '체크포인트를 만드는 동안 파일이 바뀌었습니다. 다시 저장을 요청하세요.',
      en: 'The file changed while creating the checkpoint. Request the save again.',
    },
    locale,
  )
}

export function locked(locale?: ModelLocale) {
  return L(
    {
      ko: '같은 파일의 다른 저장이 아직 끝나지 않았습니다.',
      en: 'Another save of the same file has not finished yet.',
    },
    locale,
  )
}

export function observed(
  p0: string | number,
  p1: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `디스크에서 읽은 상태:
${p0}
체크포인트 ${p1}.`,
      en: `State read from disk:
${p0}
Checkpoint ${p1}.`,
    },
    locale,
  )
}

export function unexpected(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `승인한 저장 범위와 다른 변경 또는 결과를 관측했습니다. 변경 원인은 미확정입니다. 제공 플러그인의 도구를 중지했습니다. ${p0}`,
      en: `Observed changes or results outside the approved save scope. The cause is unconfirmed. Tools from the provider plugin have been stopped. ${p0}`,
    },
    locale,
  )
}

export function invalidReceipt(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `플러그인이 저장 결과를 계약대로 돌려주지 않았습니다. ${p0}`,
      en: `The plugin did not return the save result according to the contract. ${p0}`,
    },
    locale,
  )
}

export function anchorChanges(p0: string | number, locale?: ModelLocale) {
  return L(
    {
      ko: `앵커 조회 중 Vault 변경이 관측됐습니다. 변경 원인은 미확정입니다. ${p0}`,
      en: `Observed Vault changes during the anchor query. The cause is unconfirmed. ${p0}`,
    },
    locale,
  )
}

export function banner(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `[플러그인 저장 결과: ${p0}/${p1}, v${p2}]`,
      en: `[Plugin save result: ${p0}/${p1}, v${p2}]`,
    },
    locale,
  )
}

export function saved(
  p0: string | number,
  p1: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `${p0} 저장됨. 되돌리기용 체크포인트 ${p1}.`,
      en: `${p0} saved. Rollback checkpoint ${p1}.`,
    },
    locale,
  )
}

export function warnings(locale?: ModelLocale) {
  return L({ ko: '플러그인 경고:', en: 'Plugin warnings:' }, locale)
}

export function failed(
  p0: string | number,
  p1: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `(오류: ${p0}을(를) 저장하지 못했습니다${p1}. 파일은 바뀌지 않았습니다.)`,
      en: `(Error: Could not save ${p0}${p1}. Files have not changed.)`,
    },
    locale,
  )
}

export function incomplete(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  locale?: ModelLocale,
) {
  return L(
    { ko: `${p0} 저장이 ${p1}. ${p2}`, en: `Saving ${p0} ${p1}. ${p2}` },
    locale,
  )
}

export function partial(locale?: ModelLocale) {
  return L({ ko: '일부만 됐습니다', en: 'completed only partially' }, locale)
}

export function unconfirmed(locale?: ModelLocale) {
  return L(
    {
      ko: '끝났는지 확인하지 못했습니다',
      en: 'could not be confirmed as finished',
    },
    locale,
  )
}

export function cancelledOrBusy(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 요청이 취소됐거나 플러그인이 다른 호출 중입니다.',
      en: 'The save request was cancelled or the plugin is handling another call.',
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

export function pendingSave(
  p0: string | number,
  p1: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `${p0} 저장이 끝났는지 확인하지 못했습니다. 저장됐을 수 있습니다. 문서와 파일을 확인한 뒤 다시 요청하세요. 체크포인트 ${p1}.`,
      en: `Could not confirm whether saving ${p0} has finished. It may have been saved. Check the document and files before requesting again. Checkpoint ${p1}.`,
    },
    locale,
  )
}

export function resultUnavailable(
  p0: string | number,
  p1: string | number,
  locale?: ModelLocale,
) {
  return L(
    {
      ko: `${p0} 저장 결과를 확인하지 못했습니다. 체크포인트 ${p1}.`,
      en: `Could not confirm the save result for ${p0}. Checkpoint ${p1}.`,
    },
    locale,
  )
}

export function permissionUnavailable(locale?: ModelLocale) {
  return L(
    {
      ko: '저장 권한을 확정하지 못했습니다.',
      en: 'Could not establish save authorization.',
    },
    locale,
  )
}
