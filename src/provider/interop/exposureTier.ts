import { extractUserRequest } from '../../context/taskPinning'
import { contextBoundary, lastModelMarker } from '../../i18n/modelMarkers'
import { matchesRequestKeyword } from '../requestKeyword'

/** Input is from actual user turns only, never assistant or tool messages. */
export type DocumentJobTierInput = {
  documentJobsOnly: boolean
  currentUserRequest: string
  previousUserRequests: readonly string[]
  saveKeywords: readonly string[]
  saveReady:
    | 'ready'
    | 'grant_missing'
    | 'grant_digest_stale'
    | 'tool_disabled'
    | 'commit_disabled'
    | 'provider_unavailable'
  saveActuallyTransmitted: boolean
  selectedDetailedSkill: boolean
}

/** Refuse to infer intent if an appended context can impersonate a request marker. */
export function documentUserRequest(text: string): string {
  const context = contextBoundary(text)
  if (context < 0) return extractUserRequest(text)
  if (lastModelMarker(text, 'userRequest').index > context) return ''
  return extractUserRequest(text.slice(0, context))
}

/** Calculate facts from user turns and the actual sent set; this grants no tool access. */
export function documentJobTier(input: DocumentJobTierInput) {
  const keywords = input.saveKeywords
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
  const saveIntent = [
    input.currentUserRequest,
    ...input.previousUserRequests,
  ].some((text) => {
    const request = documentUserRequest(text).toLowerCase()
    return keywords.some((word) => matchesRequestKeyword(request, word))
  })
  const exposed = input.saveReady === 'ready' && input.saveActuallyTransmitted
  const reason =
    input.saveReady === 'ready' ? 'budget_or_excluded' : input.saveReady
  const saveTool = exposed
    ? 'exposed'
    : !saveIntent
      ? 'not_requested'
      : `not_ready:${reason}`
  return {
    saveIntent,
    suppressOptional: input.documentJobsOnly,
    includeSaveInMinimum:
      input.documentJobsOnly && saveIntent && input.saveReady === 'ready',
    detailedSkillTools: !input.documentJobsOnly || input.selectedDetailedSkill,
    saveTool,
    hostNote: saveIntent && !exposed ? reason : null,
  }
}
