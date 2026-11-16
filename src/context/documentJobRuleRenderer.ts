import { L } from '../i18n/modelText'
import type { JsonObject } from '../provider/interop/protocol'

import { documentJobContractRoles } from './documentJobContract'
import { contractMetaGuidance } from './documentJobMetaGuidance'
import {
  bodySentence,
  listRoleSentence,
  roleCounts,
  symbolMarkers,
  symbolSentence,
} from './documentJobRoleShares'
import { documentJobStructureRules } from './documentJobStructureRules'
import { documentJobV2Rules } from './documentJobV2Rules'

/** Body first, symbols as detail, the dash list role last; pieces live in documentJobRoleShares. */
export function documentJobRules(contract: JsonObject): string {
  if (contract.dialect === 'hwpx-exporter-md/2')
    return documentJobV2Rules(contract)
  const roles = documentJobContractRoles(contract)
  const counts = roleCounts(contract)
  const parts = documentJobStructureRules(roles)
  if ('BODY' in roles) parts.unshift(bodySentence(counts))
  if (typeof contract.frontmatter === 'string')
    parts.push(
      L({
        ko: `초안은 다음 frontmatter로 시작하고 META 값을 새 문서에 맞게 바꿉니다:\n${contract.frontmatter}`,
        en: `Start the draft with the following frontmatter and update META values for the new document:\n${contract.frontmatter}`,
      }),
    )
  const symbols = symbolSentence(symbolMarkers(roles), counts)
  if (symbols) parts.push(symbols)
  if ('-' in roles) parts.push(listRoleSentence(counts))
  const meta = contractMetaGuidance(contract)
  if (meta) parts.push(meta)
  return [
    parts.length
      ? L({ ko: '초안 규칙: ', en: `Draft rules: ` }) + parts.join('; ') + '.'
      : '',
    L({
      ko: '새 문서 내용은 요청 주제의 근거(사용자 자료·조사 결과)로 작성하고, 샘플·본보기의 사실·수치·고유 문구는 옮기지 마세요. 자리표시 문장만 두면 draft_empty로 거절됩니다.',
      en: `Write new content using evidence for the requested topic (user materials and research). Do not copy facts, numbers or distinctive wording from the sample/exemplar. Placeholder-only drafts are rejected as draft_empty.`,
    }),
  ]
    .filter(Boolean)
    .join(' ')
}
