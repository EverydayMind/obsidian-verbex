import type {
  DocumentJobReferenceSource,
  ReferencedHwp,
} from '../../context/documentJobReferences'
import { explicitDecomposition } from '../../core/document-jobs/decompose/fitness'
import { FORMAT_REUSE_ROUTE } from '../../core/tools/toolDefinitions'
import { matchSkillsByTriggers } from '../../skills/skillTriggerMatching'

import { documentUserRequest } from './exposureTier'
import { adoptNamedHwp, eligibleNamedHwp } from './namedHwpPolicy'

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
  namedHwp?: string
  activeJob: boolean
  skills?: readonly {
    id?: string
    name?: string
    triggerKeywords?: string[]
    manuallySelected?: boolean
    /** Exposure requirement: the job Skill is the one that requires a job tool. */
    tools?: string[]
  }[]
}): DocumentJobTurnPolicy {
  const request = documentUserRequest(input.request)
  const candidate = eligibleNamedHwp(input.referencedHwp, input.namedHwp)
  const one = typeof input.referencedHwp === 'object' || Boolean(candidate)
  const skills = (input.skills ?? []).filter((skill) =>
    skill.tools?.some((tool) =>
      (DOCUMENT_JOB_TOOL_NAMES as readonly string[]).includes(tool),
    ),
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
  const referencedHwp = adoptNamedHwp(input.referencedHwp, candidate, intended)
  const referenceSource =
    typeof referencedHwp === 'object' ? referencedHwp.source : undefined
  const structural =
    typeof referencedHwp === 'object' && referenceSource === 'explicit'
  if (structural && !intended)
    reason.push('structural_candidate', 'structural_prepare')
  if (input.activeJob) reason.push('active_job')
  return {
    referencedHwp,
    referenceSource,
    intended,
    autoPrepare: intended || structural,
    expose: intended || structural || input.activeJob,
    suppress: false,
    reason,
  }
}

export { finishDocumentJobTurnPolicy } from './finishDocumentJobTurnPolicy'
