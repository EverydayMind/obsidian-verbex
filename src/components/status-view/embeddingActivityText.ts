import type { EmbeddingIndexActivity } from '../../core/rag/embeddingIndexActivity'
import { t } from '../../i18n'

export function embeddingActivityText(
  activity: EmbeddingIndexActivity | undefined,
  bm25: boolean,
): string {
  if (bm25) return t('ui.embeddingActivity.disabled')
  if (!activity) return t('ui.embeddingActivity.none')
  if (activity.phase === 'waiting') return t('ui.embeddingActivity.waiting')
  if (activity.phase === 'updating') {
    const p = activity.progress
    return t('ui.embeddingActivity.updating', {
      p0: p?.completedChunks ?? 0,
      p1: p?.totalChunks ?? 0,
      p2: p?.totalFiles ?? 0,
    })
  }
  if (activity.phase === 'hold') {
    const reason = activity.holdReason
    const label =
      reason === 'runtime_missing' ||
      reason === 'configuration' ||
      reason === 'authentication'
        ? t(`ui.embeddingActivity.${reason}`)
        : String(reason ?? '')
    return t('ui.embeddingActivity.hold', { p0: label })
  }
  if (!activity.lastRun) return t('ui.embeddingActivity.none')
  const run = activity.lastRun
  return (
    t('ui.embeddingActivity.last', {
      p0: new Date(run.finishedAt).toLocaleString(),
      p1: run.totalFiles,
    }) +
    (run.failedFiles || run.failedChunks
      ? t('ui.embeddingActivity.failed', {
          p2: run.failedFiles,
          p3: run.failedChunks,
        })
      : '')
  )
}
