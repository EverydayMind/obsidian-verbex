import { L } from '../../i18n/modelText'

import { ToolExecutionContext } from './localToolCommon'
import { PropertyQuerySpec, fmValue, show } from './propertyMatch'
import { SnapshotRow } from './propertyQuerySession'

export const signature = (
  spec: PropertyQuerySpec,
  fm: Record<string, unknown>,
): string =>
  show([fmValue(fm, spec.prop), ...spec.fields.map((f) => fmValue(fm, f))])

/** Snapshot value plus the current file state, which may have moved on. */
export function renderRow(
  spec: PropertyQuerySpec,
  ctx: ToolExecutionContext,
  row: SnapshotRow,
  index: number,
): string {
  const file = ctx.app.vault.getFileByPath?.(row.path)
  const fm = file
    ? ((ctx.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<
        string,
        unknown
      >)
    : null
  const drift = !fm
    ? L({
        ko: '\t(snapshot 이후 삭제·이동됨)',
        en: '\t(deleted or moved since snapshot)',
      })
    : signature(spec, fm) !== row.signature
      ? L({
          ko: `\t(snapshot 이후 변경: 현재 ${spec.prop}=${show(fmValue(fm, spec.prop))}${spec.fields.map((f) => ` ${f}=${show(fmValue(fm, f))}`).join('')})`,
          en: `\t(changed since snapshot: current ${spec.prop}=${show(fmValue(fm, spec.prop))}${spec.fields.map((f) => ` ${f}=${show(fmValue(fm, f))}`).join('')})`,
        })
      : ''
  return `${index + 1}. ${row.path}\t${spec.prop}=${show(row.actual)}${spec.fields.map((f) => `\t${f}=${show(row.projected[f])}`).join('')}${drift}`
}
