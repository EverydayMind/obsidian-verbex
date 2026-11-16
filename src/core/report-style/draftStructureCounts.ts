import type { ObservedDraftBlock } from './observedBlockRead'
import type { StyleSnapshot } from './types'

/** Different extractors and partial draft coverage make these counts non-equivalent. */
export function draftStructureCounts(
  snapshot: StyleSnapshot,
  blocks: readonly ObservedDraftBlock[],
) {
  return {
    sample: {
      basis: 'source_snapshot' as const,
      sections: snapshot.sections.length,
      paragraphs: snapshot.paragraphs.length,
      tables: snapshot.tables.length,
      cells: snapshot.tables.reduce(
        (sum, table) => sum + table.cells.length,
        0,
      ),
    },
    draft: {
      basis: 'partial_rendered_structure' as const,
      blocks: blocks.length,
      tables: blocks.filter((block) => block.kind === 'table').length,
      cells: blocks.filter((block) => block.kind === 'table_cell').length,
      generated: blocks.filter(
        (block) => block.selection.origin === 'generated',
      ).length,
    },
    limitation: 'different_scopes_not_fidelity_compliance' as const,
  }
}

/** Shape counts are unpaired observations, not evidence of fixed-slot compliance. */
export function strictTableGeometry(
  snapshot: StyleSnapshot,
  blocks: readonly ObservedDraftBlock[],
) {
  const collect = (
    tables: Iterable<{ rows?: number; cols?: number } | null>,
  ) => {
    const groups = new Map<
      string,
      { rows: number; cols: number; count: number }
    >()
    let unknown = 0,
      overflow = 0
    for (const table of tables) {
      const rows = table?.rows,
        cols = table?.cols
      if (
        typeof rows !== 'number' ||
        typeof cols !== 'number' ||
        !Number.isSafeInteger(rows) ||
        !Number.isSafeInteger(cols) ||
        rows < 1 ||
        cols < 1
      ) {
        unknown++
        continue
      }
      const key = `${rows}:${cols}`
      const group = groups.get(key)
      if (group) group.count++
      else if (groups.size < 64) groups.set(key, { rows, cols, count: 1 })
      else overflow++
    }
    return {
      shapes: [...groups.values()].sort(
        (a, b) => a.rows - b.rows || a.cols - b.cols,
      ),
      unknown,
      overflow,
    }
  }
  return {
    state: 'partial_observation' as const,
    comparison: 'unpaired_shape_counts' as const,
    sample: collect(
      snapshot.tables.map((table) => ({
        rows: table.rowCount,
        cols: table.columnCount,
      })),
    ),
    draft: collect(
      blocks
        .filter((block) => block.kind === 'table')
        .map((block) => block.selection.table),
    ),
    limitation: 'different_scopes_and_no_table_correspondence' as const,
  }
}
