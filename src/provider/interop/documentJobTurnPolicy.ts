import type {
  DocumentJobReferenceSource,
  ReferencedHwp,
} from '../../context/documentJobReferences'
import { explicitDecomposition } from '../../core/document-jobs/decompose/fitness'
import { FORMAT_REUSE_ROUTE } from '../../core/tools/toolDefinitions'
import { L } from '../../i18n/modelText'
import { matchSkillsByTriggers } from '../../skills/skillTriggerMatching'

import { documentUserRequest } from './exposureTier'

export const DOCUMENT_JOB_TOOL_NAMES = [
  'prepare_format_reuse',
  'save_format_decomposition',
  'produce_format_reuse',
] as const

type Reason =
  | 'pending_production'
  | 'retry_blocked'
  | 'explicit_route'
  | 'skill_trigger'
  | 'skill_selected'
  | 'structural_candidate'
  | 'structural_prepare'
  | 'active_job'

export type DocumentJobTurnPolicy = {
  retryOf?: string
  referencedHwp: ReferencedHwp
  referenceSource?: DocumentJobReferenceSource
  intended: boolean
  autoPrepare: boolean
  expose: boolean
  suppress: boolean
  reason: Reason[]
}

/** P1/P2 use only submitted user resources and currently validated jobs. */
export function documentJobTurnPolicy(input: {
  request: string
  referencedHwp: ReferencedHwp
  activeJob: boolean
  skills?: readonly {
    name?: string
    triggerKeywords?: string[]
    manuallySelected?: boolean
  }[]
}): DocumentJobTurnPolicy {
  const request = documentUserRequest(input.request)
  const one = typeof input.referencedHwp === 'object'
  const referenceSource =
    typeof input.referencedHwp === 'object'
      ? input.referencedHwp.source
      : undefined
  const structural = one && referenceSource === 'explicit'
  const jobSkillNames = (['ko', 'en'] as const).map((locale) =>
    L({ ko: '한글 서식 재사용 작업', en: `HWP format-reuse job` }, locale),
  )
  const skills = (input.skills ?? []).filter((skill) =>
    jobSkillNames.includes(skill.name ?? ''),
  )
  const reason: Reason[] = []
  if (one) {
    if (FORMAT_REUSE_ROUTE.test(request) || explicitDecomposition(request))
      reason.push('explicit_route')
    if (
      matchSkillsByTriggers(
        request,
        skills.map((skill) => ({
          name: skill.name ?? '',
          trigger_keywords: skill.triggerKeywords,
        })),
      ).length
    )
      reason.push('skill_trigger')
    if (skills.some((skill) => skill.manuallySelected))
      reason.push('skill_selected')
  }
  const intended = reason.length > 0
  if (structural && !intended)
    reason.push('structural_candidate', 'structural_prepare')
  if (input.activeJob) reason.push('active_job')
  return {
    referencedHwp: input.referencedHwp,
    referenceSource,
    intended,
    autoPrepare: intended || structural,
    expose: intended || structural || input.activeJob,
    suppress: false,
    reason,
  }
}

export { finishDocumentJobTurnPolicy } from './finishDocumentJobTurnPolicy'
