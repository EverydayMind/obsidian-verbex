import type { JsonObject } from '../../../provider/interop/protocol'
import * as modelText from '../documentContractText'

import { MD_DIALECT_V2 } from './dialectV2'
import { v2Guidance } from './v2Guidance'

/** Template inventories describe syntax only; no invented measurement counts. */
export function decompositionDraftContract(input: {
  markers: string[]
  prefixes?: Record<string, string>
  markdown?: string
  meta: Record<string, unknown>
  templatePath: string
  textPath: string
  base?: JsonObject
  differences?: unknown
  dialect?: string
}): JsonObject {
  const dialect = input.dialect ?? MD_DIALECT_V2
  const meta = Object.fromEntries(
    Object.entries(input.meta).filter(
      ([k, v]) => /^[A-Za-z][A-Za-z0-9_]*$/.test(k) && typeof v === 'string',
    ),
  )
  const frontmatter = [
    '---',
    `hwpx-dialect: ${JSON.stringify(dialect)}`,
    `hwpx-template: ${JSON.stringify(`[[${input.templatePath.split('/').pop() ?? ''}]]`)}`,
    ...Object.entries(meta).map(([k, v]) => `${k}: ${JSON.stringify(v)}`),
    '---',
  ].join('\n')
  const { role_counts: _counts, ...base } = input.base ?? {}
  return {
    tables: modelText.decompositionTables(),
    fixed_regions: [],
    style_facts: {},
    roles_dropped: [],
    not_supported: [modelText.decompositionUnmeasured()],
    ...base,
    dialect,
    ...v2Guidance(input.markers, input.prefixes ?? {}, input.markdown ?? ''),
    reference_text_path: input.textPath,
    frontmatter,
    meta_keys: Object.keys(meta),
    ...(input.differences
      ? {
          differences: JSON.parse(
            JSON.stringify(input.differences),
          ) as JsonObject[string],
        }
      : {}),
  }
}
