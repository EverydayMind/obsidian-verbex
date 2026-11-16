import { L } from '../i18n/modelText'
import type { JsonObject } from '../provider/interop/protocol'
import type { TurnRecord } from '../runstate/turnLedger'
import { canonicalize } from '../security/promptInjectionBoundary'

import { draftContractLines, isContractObject } from './documentJobContractView'

export type DocumentJobPending = {
  job_id: string
  trigger?: 'explicit'
  draft_exists: boolean
  draft_contract?: JsonObject
  draft_contract_sha256?: string
  nextStep?: JsonObject
  preview_failed?: { code: string; inputs: string }
  message?: string
}

export function pendingContracts(turn?: TurnRecord): string[] {
  const seen = new Map<string, string>()
  const preparation = turn?.documentJobPreparation?.result
  const remember = (contract: unknown, id: string): string | undefined => {
    if (!isContractObject(contract)) return undefined
    try {
      const key = canonicalize(contract)
      const first = seen.get(key)
      if (!first) seen.set(key, id)
      return first
    } catch {
      // Invalid canonical JSON cannot be compared; still deliver its contract.
      return undefined
    }
  }
  if (
    preparation?.state === 'ready' &&
    isContractObject(preparation.draft_contract)
  )
    remember(preparation.draft_contract, String(preparation.job_id))
  const lines: string[] = []
  for (const job of turn?.documentJobPending ?? []) {
    if (preparation?.state === 'ready' && job.job_id === preparation.job_id)
      continue
    if (!isContractObject(job.draft_contract)) continue
    const first = remember(job.draft_contract, job.job_id)
    if (first)
      lines.push(
        L({
          ko: `job ${job.job_id}의 draft_contract는 job ${first}와 같습니다.`,
          en: `The draft_contract for job ${job.job_id} is the same as for job ${first}.`,
        }),
      )
    else
      lines.push(
        L({
          ko: `job ${job.job_id}의 draft_contract:`,
          en: `draft_contract for job ${job.job_id}:`,
        }),
        ...draftContractLines(job.draft_contract),
      )
  }
  return lines
}

export function pendingJson(job: DocumentJobPending): string {
  const {
    draft_contract: _contract,
    draft_contract_sha256: _hash,
    ...rest
  } = job
  return JSON.stringify(rest)
}
