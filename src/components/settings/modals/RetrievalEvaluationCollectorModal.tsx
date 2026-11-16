import { App } from 'obsidian'
import { useEffect, useState } from 'react'

import type { RAGQueryInput } from '../../../core/rag/ragEngine'
import {
  type RetrievalEvaluationCase,
  type RetrievalEvaluationScenario,
} from '../../../core/rag/retrievalEvaluation'
import {
  RETRIEVAL_EVALUATION_PATH,
  loadRetrievalEvaluationSet,
  saveRetrievalEvaluationSet,
  upsertRetrievalEvaluationCase,
} from '../../../core/rag/retrievalEvaluationStore'
import type { RetrievalHit } from '../../../core/rag/retrievalTypes'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { ReactModal } from '../../common/ReactModal'

type RetrievalEvaluationCollectorModalProps = {
  app: App
  plugin: VerbexPlugin
  onClose: () => void
}

type Status = {
  kind: 'info' | 'success' | 'error'
  message: string
}

const SCENARIOS: readonly {
  value: RetrievalEvaluationScenario
  label: string
}[] = [
  {
    value: 'sample_vault',
    label: t('ui.RetrievalEvaluationCollectorModal.generalVaultQuery'),
  },
  {
    value: 'scoped_query',
    label: t('ui.RetrievalEvaluationCollectorModal.scopedQuery'),
  },
  {
    value: 'small_model',
    label: t('ui.RetrievalEvaluationCollectorModal.smallModelNarrowContext'),
  },
  {
    value: 'large_document',
    label: t('ui.RetrievalEvaluationCollectorModal.largeDocumentLongContext'),
  },
]

const CANDIDATE_LIMIT = 20

export class RetrievalEvaluationCollectorModal extends ReactModal<RetrievalEvaluationCollectorModalProps> {
  constructor(app: App, plugin: VerbexPlugin) {
    super({
      app,
      Component: RetrievalEvaluationCollectorModalComponent,
      props: { app, plugin },
      options: {
        title: t(
          'ui.RetrievalEvaluationCollectorModal.collectRetrievalEvaluationData',
        ),
      },
    })
    this.modalEl.addClass('verbex-retrieval-evaluation-collector-modal')
  }
}

function RetrievalEvaluationCollectorModalComponent({
  app,
  plugin,
  onClose,
}: RetrievalEvaluationCollectorModalProps) {
  const [caseId, setCaseId] = useState(createCaseId)
  const [query, setQuery] = useState('')
  const [scenario, setScenario] =
    useState<RetrievalEvaluationScenario>('sample_vault')
  const [tokenBudget, setTokenBudget] = useState('')
  const [contextK, setContextK] = useState('')
  const [scopeFiles, setScopeFiles] = useState('')
  const [scopeFolders, setScopeFolders] = useState('')
  const [manualUnitIds, setManualUnitIds] = useState('')
  const [hits, setHits] = useState<RetrievalHit[]>([])
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [savedCases, setSavedCases] = useState<RetrievalEvaluationCase[]>([])
  const [isLoadingSaved, setIsLoadingSaved] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const loaded = await loadRetrievalEvaluationSet(app)
        if (active) setSavedCases(loaded)
      } catch (error) {
        if (active) {
          setStatus({ kind: 'error', message: errorMessage(error) })
        }
      } finally {
        if (active) setIsLoadingSaved(false)
      }
    })()

    return () => {
      active = false
    }
  }, [app])

  const startNewCase = () => {
    setCaseId(createCaseId())
    setQuery('')
    setScenario('sample_vault')
    setTokenBudget('')
    setContextK('')
    setScopeFiles('')
    setScopeFolders('')
    setManualUnitIds('')
    setHits([])
    setSelectedUnitIds(new Set())
    setStatus(null)
  }

  const loadCase = (id: string) => {
    if (!id) {
      startNewCase()
      return
    }
    const savedCase = savedCases.find((item) => item.id === id)
    if (!savedCase) return

    setCaseId(savedCase.id)
    setQuery(savedCase.query)
    setScenario(savedCase.scenario ?? 'sample_vault')
    setTokenBudget(
      savedCase.tokenBudget === undefined ? '' : String(savedCase.tokenBudget),
    )
    setContextK(
      savedCase.contextK === undefined ? '' : String(savedCase.contextK),
    )
    setScopeFiles(savedCase.scope?.files.join('\n') ?? '')
    setScopeFolders(savedCase.scope?.folders.join('\n') ?? '')
    setManualUnitIds(savedCase.relevantUnitIds.join('\n'))
    setHits([])
    setSelectedUnitIds(new Set())
    setStatus({
      kind: 'info',
      message: t('ui.RetrievalEvaluationCollectorModal.loadedExistingCase', {
        p0: id,
      }),
    })
  }

  const runSearch = async () => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) {
      setStatus({
        kind: 'error',
        message: t('ui.RetrievalEvaluationCollectorModal.enterAQueryFirst'),
      })
      return
    }

    setIsSearching(true)
    setStatus({
      kind: 'info',
      message: t(
        'ui.RetrievalEvaluationCollectorModal.searchingTheCurrentVaultForEvidenceCandidates',
      ),
    })
    try {
      const input: RAGQueryInput = {
        query: trimmedQuery,
        hitSelection: {
          limit: CANDIDATE_LIMIT,
          expandAdjacent: false,
        },
      }
      const scope = buildScope(scopeFiles, scopeFolders)
      if (scope) input.scope = scope

      const engine = await plugin.getRAGEngine('retrieval-evaluation-collector')
      const retrieved = await engine.processQueryHits(input)
      setHits(retrieved)
      setSelectedUnitIds(new Set())
      setStatus({
        kind: 'success',
        message: t(
          'ui.RetrievalEvaluationCollectorModal.loadedEvidenceCandidatesSelectRelevantChunks',
          { p0: retrieved.length },
        ),
      })
    } catch (error) {
      console.error('[Verbex] retrieval evaluation search failed', error)
      setHits([])
      setStatus({
        kind: 'error',
        message: t('ui.RetrievalEvaluationCollectorModal.searchFailed', {
          p0: errorMessage(error),
        }),
      })
    } finally {
      setIsSearching(false)
    }
  }

  const saveCase = async () => {
    const trimmedId = caseId.trim()
    const trimmedQuery = query.trim()
    if (!trimmedId || !trimmedQuery) {
      setStatus({
        kind: 'error',
        message: t(
          'ui.RetrievalEvaluationCollectorModal.caseIDAndQueryAreRequired',
        ),
      })
      return
    }

    const parsedNumbers = parseOptionalNumbers(tokenBudget, contextK)
    if (parsedNumbers.error) {
      setStatus({ kind: 'error', message: parsedNumbers.error })
      return
    }

    const selected = [...selectedUnitIds]
    const direct = parseList(manualUnitIds)
    const relevantUnitIds = [...new Set([...selected, ...direct])]
    if (relevantUnitIds.length === 0) {
      setStatus({
        kind: 'error',
        message: t(
          'ui.RetrievalEvaluationCollectorModal.selectAtLeastOneRelevantChunkFrom',
        ),
      })
      return
    }

    const previous = savedCases.find((item) => item.id === trimmedId)
    const scope = buildScope(scopeFiles, scopeFolders)
    const nextCase: RetrievalEvaluationCase = {
      id: trimmedId,
      query: trimmedQuery,
      relevantUnitIds,
      ...(scope ? { scope } : {}),
      scenario,
      ...(parsedNumbers.tokenBudget !== undefined
        ? { tokenBudget: parsedNumbers.tokenBudget }
        : {}),
      ...(parsedNumbers.contextK !== undefined
        ? { contextK: parsedNumbers.contextK }
        : {}),
      ...(previous &&
      sameRetrievalContract(previous, {
        query: trimmedQuery,
        scope,
        scenario,
        tokenBudget: parsedNumbers.tokenBudget,
        contextK: parsedNumbers.contextK,
      }) &&
      previous.execution
        ? { execution: previous.execution }
        : {}),
    }

    setIsSaving(true)
    try {
      const nextCases = upsertRetrievalEvaluationCase(savedCases, nextCase)
      await saveRetrievalEvaluationSet(app, nextCases)
      setSavedCases(nextCases)
      setCaseId(trimmedId)
      setStatus({
        kind: 'success',
        message: t('ui.RetrievalEvaluationCollectorModal.savedCases', {
          p0: RETRIEVAL_EVALUATION_PATH,
          p1: nextCases.length,
        }),
      })
    } catch (error) {
      console.error('[Verbex] retrieval evaluation save failed', error)
      setStatus({
        kind: 'error',
        message: t('ui.RetrievalEvaluationCollectorModal.saveFailed', {
          p0: errorMessage(error),
        }),
      })
    } finally {
      setIsSaving(false)
    }
  }

  const selectedSavedId = savedCases.some((item) => item.id === caseId)
    ? caseId
    : ''

  return (
    <div className="verbex-retrieval-evaluation-collector">
      <div className="setting-item-description">
        {t(
          'ui.RetrievalEvaluationCollectorModal.markTheCorrectEvidenceChunksForEach',
        )}
      </div>
      <div className="setting-item-description" style={{ marginTop: '6px' }}>
        {t('ui.RetrievalEvaluationCollectorModal.saveLocation')}
        <code>{RETRIEVAL_EVALUATION_PATH}</code>
      </div>

      <label className="verbex-retrieval-evaluation-field">
        {t('ui.RetrievalEvaluationCollectorModal.loadExistingCase')}
        <select
          value={selectedSavedId}
          onChange={(event) => loadCase(event.currentTarget.value)}
          disabled={isLoadingSaved}
        >
          <option value="">
            {t('ui.RetrievalEvaluationCollectorModal.newCase')}
          </option>
          {savedCases.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} · {item.query}
            </option>
          ))}
        </select>
      </label>

      <label className="verbex-retrieval-evaluation-field">
        {t('ui.RetrievalEvaluationCollectorModal.caseID')}
        <input
          value={caseId}
          onChange={(event) => setCaseId(event.currentTarget.value)}
          placeholder="policy-risk-controls"
        />
      </label>

      <label className="verbex-retrieval-evaluation-field">
        {t('ui.RetrievalEvaluationCollectorModal.query')}
        <textarea
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t(
            'ui.RetrievalEvaluationCollectorModal.exampleWhatAreThePilotRollbackConditions',
          )}
          rows={3}
        />
      </label>

      <div
        className="verbex-retrieval-evaluation-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: '12px',
        }}
      >
        <label className="verbex-retrieval-evaluation-field">
          {t('ui.RetrievalEvaluationCollectorModal.scenario')}
          <select
            value={scenario}
            onChange={(event) =>
              setScenario(
                event.currentTarget.value as RetrievalEvaluationScenario,
              )
            }
          >
            {SCENARIOS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="verbex-retrieval-evaluation-field">
          {t('ui.RetrievalEvaluationCollectorModal.tokenBudgetOptional')}
          <input
            type="number"
            min={0}
            step={1}
            value={tokenBudget}
            onChange={(event) => setTokenBudget(event.currentTarget.value)}
            placeholder={t('ui.RetrievalEvaluationCollectorModal.example4096')}
          />
        </label>
        <label className="verbex-retrieval-evaluation-field">
          {t('ui.RetrievalEvaluationCollectorModal.contextKOptional')}
          <input
            type="number"
            min={1}
            step={1}
            value={contextK}
            onChange={(event) => setContextK(event.currentTarget.value)}
            placeholder={t('ui.RetrievalEvaluationCollectorModal.example5')}
          />
        </label>
      </div>

      <div
        className="verbex-retrieval-evaluation-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '12px',
        }}
      >
        <label className="verbex-retrieval-evaluation-field">
          {t(
            'ui.RetrievalEvaluationCollectorModal.fileScopeOptionalOnePerLine',
          )}
          <textarea
            value={scopeFiles}
            onChange={(event) => setScopeFiles(event.currentTarget.value)}
            placeholder="Policies/Risk.md"
            rows={3}
          />
        </label>
        <label className="verbex-retrieval-evaluation-field">
          {t(
            'ui.RetrievalEvaluationCollectorModal.folderScopeOptionalOnePerLine',
          )}
          <textarea
            value={scopeFolders}
            onChange={(event) => setScopeFolders(event.currentTarget.value)}
            placeholder="Policies"
            rows={3}
          />
        </label>
      </div>

      <div className="modal-button-container">
        <button
          className="mod-cta"
          onClick={() => void runSearch()}
          disabled={isSearching}
        >
          {isSearching
            ? t('ui.RetrievalEvaluationCollectorModal.searching')
            : t(
                'ui.RetrievalEvaluationCollectorModal.searchVaultCandidatesUpTo',
                { p0: CANDIDATE_LIMIT },
              )}
        </button>
        <button onClick={startNewCase} disabled={isSearching || isSaving}>
          {t('ui.RetrievalEvaluationCollectorModal.newCase2')}
        </button>
      </div>

      <div className="verbex-retrieval-evaluation-candidates">
        <div className="verbex-settings-sub-header">
          {t('ui.RetrievalEvaluationCollectorModal.selectRelevantEvidence')}
        </div>
        <div className="setting-item-description">
          {t(
            'ui.RetrievalEvaluationCollectorModal.checkTheSearchResultChunksNeededTo',
          )}
        </div>
        {hits.length === 0 ? (
          <div
            className="setting-item-description"
            style={{ marginTop: '8px' }}
          >
            {t('ui.RetrievalEvaluationCollectorModal.noSearchResultsYet')}
          </div>
        ) : (
          <div style={{ marginTop: '8px' }}>
            {hits.map((hit, index) => {
              const unitId = hit.locator.unitId
              const preview = compactPreview(hit.content)
              return (
                <label
                  key={unitId}
                  style={{
                    display: 'block',
                    border: '1px solid var(--background-modifier-border)',
                    borderRadius: '6px',
                    padding: '8px',
                    marginBottom: '8px',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'flex-start',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUnitIds.has(unitId)}
                      onChange={() =>
                        setSelectedUnitIds((previous) => {
                          const next = new Set(previous)
                          if (next.has(unitId)) next.delete(unitId)
                          else next.add(unitId)
                          return next
                        })
                      }
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div>
                        <strong>
                          {index + 1}
                          {t('ui.RetrievalEvaluationCollectorModal.rank')}
                          {hit.locator.path}
                        </strong>{' '}
                        <span className="setting-item-description">
                          (L{hit.locator.startLine}–L{hit.locator.endLine})
                        </span>
                      </div>
                      <code
                        style={{
                          display: 'block',
                          whiteSpace: 'normal',
                          overflowWrap: 'anywhere',
                          marginTop: '4px',
                        }}
                      >
                        {unitId}
                      </code>
                      {preview && (
                        <div
                          className="setting-item-description"
                          style={{ marginTop: '4px' }}
                        >
                          {preview}
                        </div>
                      )}
                    </div>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </div>

      <label className="verbex-retrieval-evaluation-field">
        {t(
          'ui.RetrievalEvaluationCollectorModal.addRelevantUnitIDsManuallyOptionalOne',
        )}
        <textarea
          value={manualUnitIds}
          onChange={(event) => setManualUnitIds(event.currentTarget.value)}
          placeholder="Folder/note.md@revisionHash:12-20"
          rows={3}
        />
      </label>
      <div className="setting-item-description">
        {t('ui.RetrievalEvaluationCollectorModal.currentlySelected')}
        {selectedUnitIds.size + parseList(manualUnitIds).length}
        {t(
          'ui.RetrievalEvaluationCollectorModal.unitsDuplicatesRemovedWhenSaving',
        )}
      </div>

      {status && (
        <div
          className="verbex-settings-callout"
          style={{
            marginTop: '12px',
            color:
              status.kind === 'error'
                ? 'var(--text-error)'
                : status.kind === 'success'
                  ? 'var(--text-success)'
                  : undefined,
          }}
        >
          {status.message}
        </div>
      )}

      <div className="modal-button-container" style={{ marginTop: '16px' }}>
        <button
          className="mod-cta"
          onClick={() => void saveCase()}
          disabled={isSaving}
        >
          {isSaving
            ? t('ui.RetrievalEvaluationCollectorModal.saving')
            : t('ui.RetrievalEvaluationCollectorModal.saveToGoldenSet')}
        </button>
        <button onClick={onClose} disabled={isSaving}>
          {t('ui.RetrievalEvaluationCollectorModal.close')}
        </button>
      </div>
    </div>
  )
}

function createCaseId(): string {
  return `case-${Date.now()}`
}

function parseList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ]
}

function buildScope(
  filesValue: string,
  foldersValue: string,
): { files: string[]; folders: string[] } | undefined {
  const files = parseList(filesValue)
  const folders = parseList(foldersValue)
  return files.length > 0 || folders.length > 0 ? { files, folders } : undefined
}

function parseOptionalNumbers(
  tokenBudgetValue: string,
  contextKValue: string,
): {
  tokenBudget?: number
  contextK?: number
  error?: string
} {
  const tokenBudget = parseOptionalNumber(tokenBudgetValue)
  if (
    tokenBudget.error ||
    (tokenBudget.value !== undefined && tokenBudget.value < 0)
  ) {
    return {
      error: t(
        'ui.RetrievalEvaluationCollectorModal.tokenBudgetMustBeANonnegativeInteger',
      ),
    }
  }

  const contextK = parseOptionalNumber(contextKValue)
  if (contextK.error || (contextK.value !== undefined && contextK.value <= 0)) {
    return {
      error: t(
        'ui.RetrievalEvaluationCollectorModal.contextKMustBeAnIntegerOf',
      ),
    }
  }

  return {
    ...(tokenBudget.value !== undefined
      ? { tokenBudget: tokenBudget.value }
      : {}),
    ...(contextK.value !== undefined ? { contextK: contextK.value } : {}),
  }
}

function parseOptionalNumber(value: string): { value?: number; error?: true } {
  if (!value.trim()) return {}
  const parsed = Number(value)
  return Number.isInteger(parsed) && Number.isFinite(parsed)
    ? { value: parsed }
    : { error: true }
}

function sameRetrievalContract(
  previous: RetrievalEvaluationCase,
  next: {
    query: string
    scope?: { files: string[]; folders: string[] }
    scenario: RetrievalEvaluationScenario
    tokenBudget?: number
    contextK?: number
  },
): boolean {
  return (
    previous.query === next.query &&
    previous.scenario === next.scenario &&
    previous.tokenBudget === next.tokenBudget &&
    previous.contextK === next.contextK &&
    JSON.stringify(previous.scope ?? null) ===
      JSON.stringify(next.scope ?? null)
  )
}

function compactPreview(content: string | undefined): string {
  if (!content) return ''
  const compact = content.replace(/\s+/g, ' ').trim()
  return compact.length > 360 ? `${compact.slice(0, 360)}…` : compact
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
