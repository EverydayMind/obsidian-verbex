import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

export function reviewBatchText(locale?: ModelLocale) {
  return L(
    {
      ko: {
        packLedgerFailed: 'batch ledger 상태를 적용하지 못했습니다 (pack).',
        context: '## 보조 문맥 (분석 참고 전용·인용 금지)',
        packSource: '## 검토 대상 원문 (조문별 근거 ID 포함)',
        source: '## 검토 대상 원문 (근거 ID 포함)',
        callFailed: 'pack 호출 실패',
        missingEnvelope: 'pack envelope 누락 — 조문별 재시도',
        validationFailed: 'pack 검증 실패 — 조문별 재시도:',
        allInvalid: 'pack 전 조문 검증 실패',
        missingArtifact: 'checklist artifact 누락 — 조문별 재시도',
        checklistFailed: 'checklist 항목 갱신 실패 — 조문별 재시도',
        nothingToCommit: 'pack 커밋 대상 없음',
        label: '검토 인덱스 배치',
        initFailed: 'batch ledger 초기화를 적용하지 못했습니다.',
        legacyAttention: 'legacy needs_attention 항목이 남아 있습니다.',
        rerun:
          '입력 변경 또는 적용/프로토콜 오류 항목은 원인 조치 후 재실행할 수 있습니다.',
        interrupted:
          '사용자 요청으로 중단되었습니다. 다음 실행에서 재개할 수 있습니다.',
      },
      en: {
        packLedgerFailed: 'Could not apply the batch ledger state (pack).',
        context: '## Supplementary context (analysis only; do not quote)',
        packSource: '## Source under review (with evidence IDs per article)',
        source: '## Source under review (with evidence IDs)',
        callFailed: 'Pack call failed',
        missingEnvelope: 'Pack envelope missing — retry per article',
        validationFailed: 'Pack validation failed — retry per article:',
        allInvalid: 'All articles in the pack failed validation',
        missingArtifact: 'Checklist artifact missing — retry per article',
        checklistFailed: 'Checklist item update failed — retry per article',
        nothingToCommit: 'No pack commit targets',
        label: 'Review index batch',
        initFailed: 'Could not apply batch ledger initialization.',
        legacyAttention: 'Legacy needs_attention items remain.',
        rerun:
          'Items with input changes or apply/protocol errors can be rerun after resolving the cause.',
        interrupted:
          'Stopped at the user’s request. You can resume on the next run.',
      },
    },
    locale,
  )
}

export function cappedProgressSummary(progressLines: string[]): string[] {
  if (progressLines.length === 0) return []
  const limit = 10
  const omitted = progressLines.length - limit
  return [
    L({
      ko: `진행 상세: 전체 기록은 _batch_ledger.md와 findings 산출물에 저장되었습니다. (${progressLines.length}개 항목)`,
      en: `Progress details: the full record is saved in _batch_ledger.md and the findings artifacts. (${progressLines.length} items)`,
    }),
    ...(omitted > 0
      ? [
          L({
            ko: `최근 ${limit}개 항목만 표시합니다. (${omitted}개 생략)`,
            en: `Only the latest ${limit} items are shown. (${omitted} omitted)`,
          }),
        ]
      : []),
    ...(omitted > 0 ? progressLines.slice(-limit) : progressLines),
  ]
}

export function batchRetry(note: string, ids: string[]) {
  return L({
    ko: `${note} — ${ids.join(', ')} 조문별 재시도`,
    en: `${note} — retry per article: ${ids.join(', ')}`,
  })
}
export function packApplyIncomplete(packId: string) {
  return L({
    ko: `pack ${packId} 적용 불완전 — lease 회수 후 재시도됩니다.`,
    en: `Pack ${packId} was incompletely applied — it will be retried after lease recovery.`,
  })
}
export function batchProgress(label: string) {
  return L({ ko: `${label} 진행`, en: `${label} progress` })
}
export function batchRegistration(
  total: number,
  registered: number,
  missing: string[],
) {
  return L({
    ko: `체크리스트 R ${total}건 중 ${registered}건 등재 — 미등재 ${missing.length}건: ${missing.join(', ')} (대상 파일 확인 실패)`,
    en: `${registered} of ${total} checklist R items registered — ${missing.length} unregistered: ${missing.join(', ')} (target file could not be verified)`,
  })
}
export function batchMissingUnit(title: string) {
  return L({
    ko: `batch unit을 찾지 못했습니다: ${title}`,
    en: `Batch unit not found: ${title}`,
  })
}
export function batchLedgerFailed(id: string) {
  return L({
    ko: `batch ledger 상태를 적용하지 못했습니다: ${id}`,
    en: `Could not apply the batch ledger state: ${id}`,
  })
}
export function batchCompleted(
  label: string,
  completed: number,
  total: number,
) {
  return L({
    ko: `${label}: ${completed}/${total} 실행 완료`,
    en: `${label}: ${completed}/${total} executions complete`,
  })
}
export function batchStatusCounts(
  counts: Record<string, number>,
  attention: number,
) {
  const values = `done ${counts.done}, input_empty ${counts.input_empty}, output_empty ${counts.output_empty}, truncated ${counts.truncated}, stale_input ${counts.stale_input}, apply_error ${counts.apply_error}, protocol_error ${counts.protocol_error}, legacy needs_attention ${attention}`
  return L({ ko: `상태 집계: ${values}`, en: `Status counts: ${values}` })
}
