import type { NodeRef } from './types'

/** Validate each ancestor only once while retaining cycle and section checks. */
export function validateNodeAncestry(
  node: NodeRef,
  section: string,
  nodes: ReadonlyMap<string, NodeRef>,
  verified: Set<string>,
): void {
  let parent = node.parentRef
  if (parent !== null && !nodes.has(parent))
    throw new Error(`Unresolved node ref: ${parent}`)
  const seen = new Set([node.ref])
  while (parent !== null) {
    if (seen.has(parent)) throw new Error('Node parent cycle.')
    if (parent.split('/')[0] !== section)
      throw new Error('Cross-section parent.')
    if (verified.has(parent)) break
    seen.add(parent)
    const ancestor = nodes.get(parent)
    if (!ancestor) throw new Error(`Unresolved node ref: ${parent}`)
    parent = ancestor.parentRef
  }
  for (const ref of seen) verified.add(ref)
}
