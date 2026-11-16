import type { RequestTool } from '../../types/llm/request'

import { tool } from './toolHelper'

export const boundedReportTool = (
  ...args: Parameters<typeof tool>
): RequestTool => {
  const definition = tool(...args)
  Object.assign(definition.function.parameters, { additionalProperties: false })
  return definition
}

const path = {
  type: 'string',
  minLength: 1,
  maxLength: 4096,
  description: 'User Vault-relative POSIX path.',
}
const sha = { type: 'string', pattern: '^[0-9a-f]{64}$' }

export const reportStyleDraftTool = boundedReportTool(
  'check_report_draft',
  'Report partial rendered draft structure, requested role mappings, style fallback and observed sample comparisons. Strict profiles include unpaired table shape counts, not a compliance judgment. Visible ordinal gaps and phrase classes are candidate facts; cell run candidates require verified style differences and automatic numbering is not covered. Ambiguous and unmapped roles remain unresolved. Optional baseline compares selected numeric, date, percentage, currency, quoted and acronym tokens in whole note text; it does not prove preservation of meaning. Results are facts, not a reason to discard or rewrite output. Follow nextOffset with expected_inputs_digest; input changes return no facts.',
  {
    profile_path: path,
    draft_path: path,
    template_path: path,
    baseline_path: path,
    expected_draft_sha256: sha,
    expected_inputs_digest: sha,
    offset: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
  },
  ['profile_path', 'draft_path'],
)
