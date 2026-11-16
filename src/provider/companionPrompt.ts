import type { HwpEditScope } from './contract'

/**
 * Renders host-authored KORDOC scope metadata into the model-visible turn.
 * The provider still enforces this metadata at the tool boundary; this text
 * prevents the model from mistaking a companion request for an unconstrained
 * filename-based task.
 */
/** Host-authored turn context for provider tools: KORDOC scope and native provider notes. */
export function providerTurnContext(
  scope: HwpEditScope | undefined,
  notes: string,
): string {
  return [scope ? formatCompanionScope(scope) : '', notes]
    .filter(Boolean)
    .join('\n\n')
}

export function formatCompanionScope(scope: HwpEditScope): string {
  const lines = [
    '[Host-provided KORDOC edit scope]',
    `- operation: ${scope.operation}`,
    `- one-shot contextId: ${scope.contextId}`,
    `- target path: ${scope.path}`,
    `- sourceHash: ${scope.sourceHash}`,
  ]
  if (scope.scope === 'single-block') {
    lines.push(
      `- selection lock: blockIndex=${scope.blockIndex ?? 'missing'}, type=${scope.blockType ?? 'missing'}`,
      '- Do not retarget this edit to another block. Use blockIndex plus newText, or blockIndex plus cells[{row,col,text}].',
    )
  } else {
    lines.push(
      '- selection lock: none; inspect blocks only within this target path before choosing a block.',
      '- Do not change the target path or sourceHash. Use the KORDOC provider tools for inspection and patch preparation.',
    )
  }
  if (scope.tableShape) {
    lines.push(
      `- selected table shape: ${scope.tableShape.rows} rows x ${scope.tableShape.cols} columns`,
    )
  }
  if (scope.targetCell) {
    lines.push(
      `- target cell lock: row=${scope.targetCell.row}, col=${scope.targetCell.col}; exactly one cell may be edited`,
    )
  }
  if (scope.tableCells?.length) {
    const preview = scope.tableCells
      .slice(0, 32)
      .map(
        (cell) =>
          `(${cell.row},${cell.col}) ${cell.text.replace(/\s+/g, ' ').slice(0, 120)}`,
      )
      .join(' | ')
    lines.push(`- editable cell previews: ${preview}`)
    if (scope.tableCellsTruncated) {
      lines.push(
        '- editable cell preview is truncated; do not treat the preview list as an allowlist. Provider capability validation remains authoritative.',
      )
    }
  }
  return lines.join('\n')
}
