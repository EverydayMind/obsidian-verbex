import { t } from '../../i18n'

export function checkpointSummary(checkpoints: number, files: number): string {
  return t('ui.checkpointRuns.summary', { p0: checkpoints, p1: files })
}

export function checkpointPaths(paths: string[]): string {
  const shown = paths.slice(0, 3)
  if (paths.length > 3)
    shown.push(t('ui.checkpointRuns.more', { p0: paths.length - 3 }))
  return shown.join(', ')
}
