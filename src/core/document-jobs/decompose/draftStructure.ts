import type { JsonObject } from '../../../provider/interop/protocol'
import * as modelText from '../documentContractText'

import { MD_DIALECT_V2 } from './dialectV2'
import { glyphObservations } from './glyphObservations'
import { codePoints, markdownParagraphs, plainInline } from './markdownFacts'

/** Receipt observations never affect generation or trigger a retry. */
export function draftStructure(
  markdown: string,
  contract: JsonObject,
  prefixes?: Record<string, string>,
): JsonObject {
  if (contract.dialect !== MD_DIALECT_V2) return {}
  const keys = Object.keys(contract.roles ?? {}).filter((k) =>
    /^(H[1-6]|BODY)(:|$)/.test(k),
  )
  const paragraphs = markdownParagraphs(markdown)
  const glyphs = glyphObservations(paragraphs, prefixes)
  const lists = paragraphs.filter((p) => p.list)
  const unknown = paragraphs.flatMap((p) => {
    const role = p.role
    return role && !keys.includes(p.key)
      ? [
          {
            name: role.name,
            line: role.line,
            availableLevels: keys
              .filter((k) => k.endsWith(':' + role.name))
              .map((k) => k.split(':')[0]),
          },
        ]
      : []
  })
  const used = keys.filter((k) => paragraphs.some((p) => p.key === k))
  const count = new Set([
    ...glyphs.filter((g) => g.kind !== 'unprefixed').map((g) => g.paragraph),
    ...lists,
  ]).size
  return {
    draft_structure: {
      leadingGlyphParagraphs: {
        count: glyphs.length,
        examples: glyphs.slice(0, 3).map(({ paragraph: p }) => ({
          line: p.line,
          text: codePoints(plainInline(p.text), 20),
        })),
      },
      markdownListItems: lists.length,
      unknownRoleDirectives: unknown,
      keysUsed: used,
      keysUnused: keys.filter((k) => !used.includes(k)),
    },
    ...(count || unknown.length
      ? {
          draft_structure_guidance: modelText.draftStructureGuidance(count),
        }
      : {}),
  }
}
