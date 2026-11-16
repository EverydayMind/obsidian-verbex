import { canonicalDigest } from '../../../security/promptInjectionBoundary'

import { truncatedBlockFactory } from './truncatedBlocks'
import { type Block, DecomposeError, type ModelInput, RULES } from './types'

/** Verify the common ref space before joining any structural or textual facts. */
export async function blockList(input: ModelInput): Promise<Block[]> {
  const { snapshot, structure, semantic, texts } = input
  if (
    snapshot.source.sha256 !== structure.sample_sha256 ||
    (await canonicalDigest(snapshot.nodes)) !== structure.structure_sha256
  )
    throw new DecomposeError('structure_mismatch')
  const top = snapshot.nodes
    .filter((n) => n.kind === 'paragraph' && n.parentRef === null)
    .sort((a, b) => (a.topLevelOrder ?? 0) - (b.topLevelOrder ?? 0))
  if (
    structure.blocks.some((b, i) => b.ref !== top[i]?.ref) ||
    (!structure.truncated && structure.blocks.length !== top.length)
  )
    throw new DecomposeError('structure_mismatch')
  if (new TextEncoder().encode(JSON.stringify(texts)).length > RULES.textBytes)
    throw new DecomposeError('too_large')
  const paragraphs = new Map(snapshot.paragraphs.map((p) => [p.ref, p]))
  const nodes = new Map(snapshot.nodes.map((n) => [n.ref, n]))
  const semantics = new Map(semantic.nodes.map((n) => [n.ref, n]))
  for (const p of snapshot.paragraphs) {
    if (
      typeof texts[p.ref] !== 'string' ||
      [...texts[p.ref]].length !== p.textCodePoints
    )
      throw new DecomposeError('text_mismatch', [p.ref])
  }
  let page = 0
  const fallback = truncatedBlockFactory(snapshot)
  return top.map((n, i) => {
    const b = structure.blocks[i] ?? fallback(n.ref)
    if (i && b.pageBreak) page++
    const sem = semantics.get(n.ref)
    const cells = (b.table?.cells ?? []).map((c) => {
      if (
        nodes.get(c.ref)?.kind !== 'cell' ||
        nodes.get(c.ref)?.parentRef !== b.table?.ref
      )
        throw new DecomposeError('structure_mismatch', [c.ref])
      const paragraphRefs = snapshot.nodes
        .filter((p) => p.kind === 'paragraph' && p.parentRef === c.ref)
        .map((p) => p.ref)
      return {
        ...c,
        paragraphRefs,
        text: paragraphRefs.map((ref) => texts[ref]).join('\n'),
      }
    })
    if (b.table && nodes.get(b.table.ref)?.parentRef !== n.ref)
      throw new DecomposeError('structure_mismatch', [b.table.ref])
    return {
      ...b,
      page,
      text: texts[n.ref],
      prefix: paragraphs.get(n.ref)?.prefix ?? null,
      semanticRole:
        sem?.state === 'decided' ? (sem.candidates[0]?.role ?? null) : null,
      cells,
    }
  })
}
