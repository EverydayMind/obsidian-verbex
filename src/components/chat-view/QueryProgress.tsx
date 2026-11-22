import { useSyncExternalStore } from 'react'

import { t } from '../../i18n'
import type { QueryProgressState } from '../../types/queryProgress'
import {
  isAwaitingApproval,
  subscribeApprovalWait,
} from '../../utils/approvalWait'
import DotLoader from '../common/DotLoader'

export type {
  IndexProgress,
  QueryProgressState,
} from '../../types/queryProgress'

// TODO: Update style
export default function QueryProgress({
  state,
}: {
  state: QueryProgressState
}) {
  const awaitingApproval = useSyncExternalStore(
    subscribeApprovalWait,
    isAwaitingApproval,
  )
  switch (state.type) {
    case 'census-report':
      return (
        <div className="verbex-query-progress">
          <p>
            {t('census.checking')}
            <DotLoader />
          </p>
        </div>
      )
    case 'idle':
      return null
    case 'reading-mentionables':
      return (
        <div className="verbex-query-progress">
          <p>
            {t('ui.QueryProgress.readingMentioned')}
            <DotLoader />
          </p>
        </div>
      )
    case 'indexing':
      return (
        <div className="verbex-query-progress">
          <p>
            {t('ui.QueryProgress.indexingFiles', {
              p0: state.indexProgress.totalFiles,
            })}
            <DotLoader />
          </p>
          <p className="verbex-query-progress-detail">
            {t('ui.QueryProgress.chunksIndexed', {
              p0: state.indexProgress.completedChunks,
              p1: state.indexProgress.totalChunks,
            })}
          </p>
          {state.indexProgress.waitingForRateLimit && (
            <p className="verbex-query-progress-detail">
              {t('ui.QueryProgress.waitingRateLimit')}
            </p>
          )}
        </div>
      )
    case 'querying':
      return (
        <div className="verbex-query-progress">
          <p>
            {t('ui.QueryProgress.queryingVault')}
            <DotLoader />
          </p>
        </div>
      )
    case 'graph-expanding':
      return (
        <div className="verbex-query-progress">
          <p>
            {t('ui.QueryProgress.expandingNotes')}
            <DotLoader />
          </p>
          <p className="verbex-query-progress-detail">
            {t('ui.QueryProgress.followingLinks')}
          </p>
        </div>
      )
    case 'querying-done':
      return (
        <div className="verbex-query-progress">
          <p>
            {t('ui.QueryProgress.readingRelated')}
            <DotLoader />
          </p>
          {state.queryResult.map((result, idx) => (
            <div key={result.path} className="verbex-query-progress-item">
              <p>{result.path}</p>
              <span className="verbex-query-progress-rank">
                {idx + 1}
                {t('ui.QueryProgress.rank')}
              </span>
            </div>
          ))}
        </div>
      )
    case 'agent-thinking':
      return (
        <div className="verbex-query-progress">
          <p>
            {t('ui.QueryProgress.lLMIsThinkingAttempt', {
              p0: state.iteration,
            })}
            <DotLoader />
          </p>
        </div>
      )
    case 'agent-tool-start':
      return (
        <div className="verbex-query-progress">
          <p>
            {awaitingApproval
              ? t('ui.QueryProgress.waitingForApproval', {
                  p0: state.toolName,
                })
              : t('ui.QueryProgress.runningToolAttempt', {
                  p0: state.toolName,
                  p1: state.iteration,
                })}
            <DotLoader />
          </p>
        </div>
      )
    case 'large-file-progress': {
      const operation =
        state.operation === 'transform'
          ? t('ui.QueryProgress.largeDocumentConversion')
          : t('ui.QueryProgress.wholeDocumentAnalysis')
      const phase =
        state.phase === 'mapping'
          ? t('ui.QueryProgress.reviewBySection')
          : state.phase === 'reducing'
            ? t('ui.QueryProgress.crossSectionSynthesis')
            : state.phase === 'verifying'
              ? t('ui.QueryProgress.crossCheckOmissionsAndContradictions')
              : t('ui.QueryProgress.convertBySection')
      return (
        <div className="verbex-query-progress">
          <p>
            {t('ui.QueryProgress.inProgress', {
              p0: operation,
              p1: state.path,
            })}
            <DotLoader />
          </p>
          <p className="verbex-query-progress-detail">
            {`${phase} ${state.index}/${state.total}`}
          </p>
        </div>
      )
    }
  }
}
