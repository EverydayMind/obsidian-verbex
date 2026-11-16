import type { Binding, StyleSnapshot } from '../../report-style/types'

import type { Fact, Projection } from './types'

/** Matches writer output + Exporter classifyMetaParagraphs/blockRole. Style
 * Divs enter its top-level loop without contextPrevious, so they leave DIV. */
export function renderedSpacingRole(block: Projection): string {
  if (block.role === 'BODY:META') {
    const label = /^([^:：\r\n]+)[:：][^\r\n]*$/u.exec(block.text.trim())?.[1]
    const length = label ? [...label.replace(/\s/gu, '')].length : 0
    return length >= 1 && length <= 20 ? 'DIV' : 'BODY'
  }
  if (block.role.startsWith('BODY:')) return 'DIV'
  if (block.role === '-') return 'LIST'
  if (block.role === 'data_table') return 'TABLE'
  return block.role === 'unclassified' ? 'BODY' : block.role
}
export function trackedSpacingPrevious(
  role: string,
  bound: ReadonlySet<string>,
): boolean {
  return ['START', 'DIV', 'LIST', 'TABLE'].includes(role) || bound.has(role)
}
/** Use emitted top-level roles for both population and predecessor grouping,
 * rather than pretending a style Div is an independent paragraph rule. */
export function spacingProjection(
  snapshot: StyleSnapshot,
  blocks: Projection[],
  bindings: Binding[],
  facts: Fact[],
): StyleSnapshot {
  const byRef = new Map(snapshot.paragraphs.map((p) => [p.ref, p]))
  const nodes: StyleSnapshot['nodes'] = [],
    paragraphs: StyleSnapshot['paragraphs'] = []
  for (const [order, block] of blocks.entries()) {
    const source = byRef.get(block.representativeRef ?? block.ref)
    if (!source) continue
    nodes.push({
      ref: block.ref,
      kind: 'paragraph',
      parentRef: null,
      topLevelOrder: order,
    })
    paragraphs.push({
      ...source,
      ref: block.ref,
      prefix: block.role === 'spacer' ? null : renderedSpacingRole(block),
      textCodePoints:
        block.role === 'spacer' ? 0 : Math.max(1, source.textCodePoints),
    })
  }
  for (const binding of bindings) {
    if (!binding.marker.startsWith('BODY:') && binding.marker !== '-') continue
    facts.push({
      step: 6,
      rule: 'spacing_rule_unsupported',
      refs: blocks.filter((b) => b.role === binding.marker).map((b) => b.ref),
      value: {
        marker: binding.marker,
        reason:
          binding.marker === '-'
            ? 'list_has_no_context_input'
            : 'variant_has_no_context_key',
      },
    })
  }
  return { ...snapshot, nodes, paragraphs, unsupported: [], tables: [] }
}
