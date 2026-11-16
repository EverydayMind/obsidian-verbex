import { L } from '../../../../i18n/modelText'
import { type HierarchyJudgement } from '../dialectV2'
import {
  blockMarkdown,
  commentText,
  writeDecompositionMarkdown,
} from '../markdown'
import { DecomposeError, type Model, type Projection, RULES } from '../types'

import type { HierarchyFeature } from './features'
import { inlineMarkdown } from './inline'
import { numberHierarchy } from './numbering'
import { roleDescription } from './roleCatalog'

export function paragraphMarkdown(
  f: HierarchyFeature,
  j: HierarchyJudgement,
  prefix = '',
): string {
  const name = j.applicationKey.split(':')[1]
  const description = name?.startsWith('기호')
    ? L({
        ko: `${j.semanticRole ? j.semanticRole + ', ' : ''}${j.marker.series ?? j.marker.symbol ?? L({ ko: '없음', en: 'none' })} 기호`,
        en: `${j.semanticRole ? j.semanticRole + ', ' : ''}${j.marker.series ?? j.marker.symbol ?? L({ ko: '없음', en: 'none' })} symbol`,
      })
    : name
      ? roleDescription(name, f.sizePt)
      : ''
  const directive = name
    ? `<!--hwpx:${commentText(name + ' ' + description)}-->\n`
    : ''
  const heading = j.applicationKey.startsWith('H')
    ? '#'.repeat(j.depth) + ' '
    : ''
  return directive + heading + prefix + inlineMarkdown(f, j)
}
export function writeHierarchyMarkdown(input: {
  model: Model
  features: HierarchyFeature[]
  judgements: HierarchyJudgement[]
  templateName: string
  decompositionId: string
  sourceSha256: string
}) {
  const numbering = numberHierarchy(input.judgements, input.features)
  const byRef = new Map(input.judgements.map((j) => [j.ref, j]))
  const features = new Map(
    input.features.filter((f) => !f.object).map((f) => [f.ref, f]),
  )
  const blocks = input.model.blocks.map((b: Projection) => {
    const f = features.get(b.ref),
      j = byRef.get(b.ref)
    if (!f || !j) return blockMarkdown(b)
    const omitted = b.omittedObjects.map(
      (o) =>
        `<!-- hwpx:omitted kind=${commentText(o.kind)} ref=${commentText(o.ref)} -->`,
    )
    return [
      ...omitted,
      paragraphMarkdown(f, j, numbering.prefixes.get(j.ref)),
    ].join('\n\n')
  })
  const header = writeDecompositionMarkdown({
    ...input,
    model: { ...input.model, blocks: [] },
  }).trimEnd()
  const markdown = [header, ...blocks].filter(Boolean).join('\n\n') + '\n'
  if (new TextEncoder().encode(markdown).length > RULES.textBytes)
    throw new DecomposeError('too_large')
  return { markdown, facts: numbering.facts }
}
