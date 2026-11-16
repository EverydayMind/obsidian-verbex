import { DOCUMENT_JOB_PRODUCTION_GUIDANCE } from '../../context/documentJobPendingFacts'
import { STRUCTURAL_PREPARATION_CONDITION } from '../../context/documentJobPreparationGuidance'
import type { FormatJob } from '../../core/document-jobs/jobTypes'
import type { StructureObservation } from '../../core/tools/localChangePreparation'
import { L } from '../../i18n/modelText'

import { documentJobNextStep } from './documentJobDraftInput'

export function documentJobNextStepFact(
  job: FormatJob,
  trigger?: 'explicit' | 'structural',
  observation?: StructureObservation,
): string {
  const condition =
    trigger === 'structural' ? STRUCTURAL_PREPARATION_CONDITION() + ' ' : ''
  const args = JSON.stringify(documentJobNextStep(job).arguments)
  if (observation?.structure === 'issues')
    return L({
      ko: `[서식 작업] 이 파일은 작업 ${job.id}의 초안입니다. ${condition}위 초안 구조 사실을 고치려면 같은 draft_path에 다시 쓴 뒤 produce_format_reuse를 호출합니다. 그대로 만들려면 바로 호출합니다: ${args} \`produce_format_reuse\`는 호출할 때 저장 승인을 따로 받습니다.`,
      en: `[Format job] This file is the draft for job ${job.id}. ${condition}To correct the draft structure facts above, rewrite the same draft_path and call produce_format_reuse. To generate as-is, call it now: ${args} \`produce_format_reuse\` requests save approval separately when called.`,
    })
  return L({
    ko: `[서식 작업] 이 파일은 작업 ${job.id}의 초안입니다. ${condition}다음 단계: produce_format_reuse ${args} ${DOCUMENT_JOB_PRODUCTION_GUIDANCE()}`,
    en: `[Format job] This file is the draft for job ${job.id}. ${condition}Next step: produce_format_reuse ${args} ${DOCUMENT_JOB_PRODUCTION_GUIDANCE()}`,
  })
}
