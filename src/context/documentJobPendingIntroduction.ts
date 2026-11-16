import { L } from '../i18n/modelText'

import { pendingJson } from './documentJobPendingContracts'
import type { DocumentJobPending } from './documentJobPendingContracts'

export function pendingJobIntroduction(): string[] {
  return [
    L({
      ko: '이 대화에 HWPX 생성이 남은 서식 작업이 있습니다(호스트 작업 기록). nextStep이 있는 항목은 그 단계로 이어갑니다.',
      en: `This conversation has a format job awaiting HWPX generation (host job records). Continue items with nextStep at that step.`,
    }),
    L({
      ko: '이 작업의 HWPX는 일반 내보내기로 대신 만들지 않습니다.',
      en: `Do not substitute ordinary export for this job's HWPX.`,
    }),
  ]
}

export function pendingJobRows(
  pending: readonly DocumentJobPending[],
): string[] {
  return pending.map((job) =>
    L({
      ko: `- 생성 대기: ${pendingJson(job)}`,
      en: `- Awaiting generation: ${pendingJson(job)}`,
    }),
  )
}
