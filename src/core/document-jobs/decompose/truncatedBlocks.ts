import type { StyleSnapshot } from '../../report-style/types'

import type { StructureBlock } from './types'

/** Missing structural tails cannot justify fixed regions or heading counters.
 * Snapshot table geometry still lets the writer retain their ordinary content. */
export function truncatedBlockFactory(snapshot: StyleSnapshot) {
  const tables = new Map(snapshot.tables.map((t) => [t.ref, t]))
  const owners = new Map(
    snapshot.nodes
      .filter((n) => n.kind === 'table')
      .map((n) => [n.parentRef, tables.get(n.ref)]),
  )
  const paragraphs = new Map(snapshot.paragraphs.map((p) => [p.ref, p]))
  return (ref: string): StructureBlock => {
    const table = owners.get(ref)
    return {
      ref,
      kind: table ? 'table_host' : 'paragraph',
      pageBreak: false,
      columnBreak: false,
      controls: [],
      objects: [],
      ...(table
        ? {
            table: {
              ref: table.ref,
              rows: table.rowCount,
              cols: table.columnCount,
              signature: '',
              cells: table.cells.map((c) => ({
                ref: c.ref,
                row: c.row,
                col: c.column,
                rowSpan: c.rowSpan,
                colSpan: c.columnSpan,
                paragraphs: c.paragraphRefs.length,
                codePoints: c.paragraphRefs.reduce(
                  (n, r) => n + (paragraphs.get(r)?.textCodePoints ?? 0),
                  0,
                ),
                counter: false,
              })),
            },
          }
        : {}),
    }
  }
}
