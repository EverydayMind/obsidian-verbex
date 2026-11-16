import { t } from '../i18n'
import type { IndexProgress } from '../types/queryProgress'

const SUCCESS_NOTICE_MS = 3000
// A failure asks the user to act (check the embedding connection), so it must
// stay long enough to be read; it used to vanish after one second.
const FAILURE_NOTICE_MS = 15000

export function indexNoticeMs(failed: boolean): number {
  return failed ? FAILURE_NOTICE_MS : SUCCESS_NOTICE_MS
}

export function formatIndexProgressNotice(
  progress: Pick<
    IndexProgress,
    'completedChunks' | 'totalChunks' | 'waitingForRateLimit'
  >,
): string {
  const line = t('notices.index.progress', {
    completed: progress.completedChunks,
    total: progress.totalChunks,
  })
  return progress.waitingForRateLimit
    ? `${line}\n${t('notices.index.rateLimited')}`
    : line
}
