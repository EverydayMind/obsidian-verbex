import { t } from '../../i18n'
import type { QueryProgressState } from '../../types/queryProgress'
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
  switch (state.type) {
    case 'idle':
      return null
    case 'reading-mentionables':
      return (
        <div className="verbex-query-progress">
          <p>
            Reading mentioned files
            <DotLoader />
          </p>
        </div>
      )
    case 'indexing':
      return (
        <div className="verbex-query-progress">
          <p>
            {`Indexing ${state.indexProgress.totalFiles} file`}
            <DotLoader />
          </p>
          <p className="verbex-query-progress-detail">{`${state.indexProgress.completedChunks}/${state.indexProgress.totalChunks} chunks indexed`}</p>
          {state.indexProgress.waitingForRateLimit && (
            <p className="verbex-query-progress-detail">
              Waiting for rate limit to reset...
            </p>
          )}
        </div>
      )
    case 'querying':
      return (
        <div className="verbex-query-progress">
          <p>
            Querying the vault
            <DotLoader />
          </p>
        </div>
      )
    case 'graph-expanding':
      return (
        <div className="verbex-query-progress">
          <p>
            Expanding related notes
            <DotLoader />
          </p>
          <p className="verbex-query-progress-detail">
            Following wikilinks and backlinks
          </p>
        </div>
      )
    case 'querying-done':
      return (
        <div className="verbex-query-progress">
          <p>
            Reading related files
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
            {t('ui.QueryProgress.runningToolAttempt', {
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
