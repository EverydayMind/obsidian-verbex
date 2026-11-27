import React, { useEffect, useState } from 'react'

import { t } from '../../i18n'
import VerbexPlugin from '../../main'
import {
  VerbexContextTraceItem,
  VerbexStatusSnapshot,
} from '../../verbex/types'
import { VerbexController } from '../../VerbexController'

import { embeddingActivityText } from './embeddingActivityText'

type StatusViewRootProps = {
  controller: VerbexController
  plugin: VerbexPlugin
}

function CountPill({ label, count }: { label: string; count: number }) {
  return (
    <div className="verbex-status-pill">
      <span>{label}</span>
      <strong>{count}</strong>
    </div>
  )
}

function SourceBadge({ source }: { source: VerbexContextTraceItem['source'] }) {
  return (
    <span className="verbex-status-badge" data-source={source}>
      {t(`views.status.sources.${source}`)}
    </span>
  )
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const rounded = unit === 0 ? value : Math.round(value * 10) / 10
  return `${rounded} ${units[unit]}`
}

function formatEmbeddingStorageBreakdown(
  index: VerbexStatusSnapshot['embeddingIndex'],
): string | null {
  if (!index || index.contentBytes === undefined) return null
  return [
    t('ui.StatusViewRoot.contentBytes', {
      p0: formatBytes(index.contentBytes),
    }),
    t('ui.StatusViewRoot.vectorBytes', {
      p0: formatBytes(index.embeddingBytes ?? 0),
    }),
    t('ui.StatusViewRoot.metadataBytes', {
      p0: formatBytes(index.metadataBytes ?? 0),
    }),
    t('ui.StatusViewRoot.tableBytes', {
      p0: formatBytes(index.tableBytes ?? 0),
    }),
    t('ui.StatusViewRoot.indexBytes', {
      p0: formatBytes(index.indexBytes ?? 0),
    }),
  ].join(' · ')
}

export function StatusViewRoot({ controller, plugin }: StatusViewRootProps) {
  const [snapshot, setSnapshot] = useState<VerbexStatusSnapshot>(
    controller.getSnapshot(),
  )

  useEffect(() => controller.addStatusListener(setSnapshot), [controller])

  const activeRun = snapshot.activeRun
  const contextUtilization = snapshot.lastContext
    ? Math.min(
        100,
        Math.round(
          (snapshot.lastContext.estimatedTokens /
            Math.max(1, snapshot.lastContext.tokenBudget)) *
            100,
        ),
      )
    : 0
  const embeddingStorageBreakdown = formatEmbeddingStorageBreakdown(
    snapshot.embeddingIndex,
  )
  const providerStatus = snapshot.providerStatus ?? {
    registryAvailable: false,
    generation: null,
    toolNames: [],
  }
  const providerState = !providerStatus.registryAvailable
    ? 'unavailable'
    : providerStatus.toolNames.length > 0
      ? 'ready'
      : 'waiting'

  return (
    <div className="verbex-status-view">
      <div className="verbex-status-header">
        <h2>{t('views.status.title')}</h2>
        <button
          type="button"
          aria-label={t('views.status.refresh')}
          onClick={() => void controller.refresh({ embeddingStats: 'eager' })}
        >
          {t('views.status.refresh')}
        </button>
      </div>

      {snapshot.lastError && (
        <div className="verbex-settings-callout">{snapshot.lastError}</div>
      )}

      <div className="verbex-status-grid">
        <CountPill
          label={t('views.status.skills')}
          count={snapshot.skills.length}
        />
        <CountPill
          label={t('views.status.workflows')}
          count={snapshot.workflows.length}
        />
        <CountPill
          label={t('views.status.paused')}
          count={snapshot.pausedRuns.length}
        />
        <CountPill
          label={t('views.status.errors')}
          count={snapshot.workflowErrors.length}
        />
        <CountPill
          label={t('views.status.bm25Docs')}
          count={snapshot.lexicalIndex?.documentCount ?? 0}
        />
        <CountPill
          label={t('views.status.vectorFiles')}
          count={snapshot.embeddingIndex?.indexedFilesCount ?? 0}
        />
        <CountPill
          label={t('views.status.vectorChunks')}
          count={snapshot.embeddingIndex?.rowCount ?? 0}
        />
      </div>

      <section aria-label={t('views.status.readiness.label')}>
        <h3>{t('views.status.readiness.label')}</h3>
        <div className="verbex-status-grid">
          {(['ui', 'catalog', 'lexical', 'semantic'] as const).map((stage) => {
            const readiness = plugin.getReadinessSnapshot().stages[stage]
            const notUsed =
              stage === 'semantic' &&
              controller.getSettings().verbex.search.mode === 'bm25'
            return (
              <div
                className="verbex-status-pill"
                key={stage}
                data-state={notUsed ? 'not-used' : readiness.state}
                title={
                  notUsed
                    ? t('ui.StatusViewRoot.bm25Only')
                    : (readiness.error ?? undefined)
                }
              >
                <span>{t(`views.status.readiness.${stage}`)}</span>
                <strong>
                  {notUsed ? t('ui.StatusViewRoot.notUsed') : readiness.state}
                </strong>
              </div>
            )
          })}
        </div>
      </section>

      <section aria-label={t('views.status.providerTools.label')}>
        <h3>{t('views.status.providerTools.label')}</h3>
        {snapshot.pluginToolStates && (
          <p>
            {t('ui.StatusViewRoot.pluginToolStates', snapshot.pluginToolStates)}
          </p>
        )}
        <div className="verbex-status-grid">
          <div className="verbex-status-pill" data-state={providerState}>
            <span>{t('views.status.providerTools.registry')}</span>
            <strong>
              {t(`views.status.providerTools.states.${providerState}`)}
            </strong>
          </div>
          <div className="verbex-status-pill">
            <span>{t('views.status.providerTools.availableCount')}</span>
            <strong>{providerStatus.toolNames.length}</strong>
          </div>
        </div>
        {providerStatus.registryAvailable ? null : (
          <div className="verbex-settings-desc">
            {t('views.status.providerTools.unavailableHelp')}
          </div>
        )}
      </section>

      <section>
        <h3>{t('views.status.searchIndex')}</h3>
        <div className="verbex-settings-desc">
          {embeddingActivityText(
            snapshot.embeddingActivity,
            controller.getSettings().verbex.search.mode === 'bm25',
          )}
        </div>
        {snapshot.lexicalIndex ? (
          <div className="verbex-settings-desc">
            BM25: {snapshot.lexicalIndex.indexPath} ·{' '}
            {t('ui.StatusViewRoot.documents', {
              p0: snapshot.lexicalIndex.documentCount,
            })}{' '}
            ·{' '}
            {snapshot.lexicalIndex.updatedAt ?? t('ui.StatusViewRoot.notBuilt')}
          </div>
        ) : (
          <div className="verbex-settings-desc">{t('views.status.noBm25')}</div>
        )}
        {snapshot.embeddingIndex ? (
          <>
            <div className="verbex-settings-desc" style={{ marginTop: '4px' }}>
              {t('views.status.vector', {
                model: snapshot.embeddingIndex.model,
              })}
              : {snapshot.embeddingIndex.indexPath} ·{' '}
              {formatBytes(snapshot.embeddingIndex.totalDataBytes)} (
              {t('ui.StatusViewRoot.chunks', {
                p0: snapshot.embeddingIndex.rowCount,
              })}
              )
            </div>
            {embeddingStorageBreakdown && (
              <div
                className="verbex-settings-desc"
                style={{ marginTop: '4px' }}
              >
                {t('views.status.storageBreakdown', {
                  breakdown: embeddingStorageBreakdown,
                })}
              </div>
            )}
          </>
        ) : (
          <div className="verbex-settings-desc" style={{ marginTop: '4px' }}>
            {t('views.status.noVector')}
          </div>
        )}
      </section>

      <section>
        <h3>{t('views.status.contextTrace')}</h3>
        {snapshot.lastContext ? (
          <>
            <div className="verbex-settings-desc">
              {t('views.status.autoContextTokens', {
                estimated: snapshot.lastContext.estimatedTokens,
                budget: snapshot.lastContext.tokenBudget,
              })}
            </div>
            <div
              className="verbex-status-context-gauge"
              aria-label={t('views.status.autoContextGauge', {
                percent: contextUtilization,
              })}
              title={t('views.status.autoContextHelp')}
            >
              <div
                className="verbex-status-context-gauge__fill"
                style={{ width: `${contextUtilization}%` }}
              />
            </div>
            <div className="verbex-settings-desc">
              {t('ui.StatusViewRoot.contextBudget', { p0: contextUtilization })}
            </div>
            <ul className="verbex-status-list">
              {snapshot.lastContext.items.map((item, index) => (
                <li
                  key={`${item.source}-${item.path}-${index}`}
                  data-included={item.included_in_context}
                  title={item.snippet}
                >
                  <strong>
                    <SourceBadge source={item.source} />
                    {item.score !== null
                      ? ` ${(item.score * 100).toFixed(1)}%`
                      : ''}
                    {item.included_in_context
                      ? ''
                      : t('ui.StatusViewRoot.excluded')}
                  </strong>
                  <span>
                    {item.path}
                    {item.heading ? ` · ${item.heading}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="verbex-settings-desc">
            {t('views.status.previewHelp')}
          </div>
        )}
      </section>

      <section>
        <h3>{t('views.status.activeRun')}</h3>
        {activeRun ? (
          <>
            <div className="verbex-status-run-title">{activeRun.title}</div>
            <div className="verbex-settings-desc">
              {activeRun.status} ·{' '}
              {activeRun.skill ?? t('ui.StatusViewRoot.adHoc')} ·{' '}
              {activeRun.workflow ?? t('ui.StatusViewRoot.noWorkflow')}
            </div>
            <ol className="verbex-status-plan">
              {activeRun.plan.map((step) => (
                <li key={step.id} data-status={step.status}>
                  <span>{step.status}</span>
                  <strong>{step.title}</strong>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="verbex-settings-desc">
            {t('views.status.noActiveRun')}
          </div>
        )}
      </section>

      <section>
        <h3>{t('views.status.skillsSection')}</h3>
        {snapshot.skills.length ? (
          <ul className="verbex-status-list">
            {snapshot.skills.map((skill) => (
              <li key={skill.id}>
                <strong>{skill.name}</strong>
                <span>{skill.summary ?? skill.path}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="verbex-settings-desc">
            {t('views.status.noSkills')}
          </div>
        )}
      </section>

      {snapshot.workflowErrors.length > 0 && (
        <section>
          <h3>{t('views.status.workflowErrors')}</h3>
          <ul className="verbex-status-list">
            {snapshot.workflowErrors.map((error) => (
              <li key={error.path}>
                <strong>{error.path}</strong>
                <span>{error.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
