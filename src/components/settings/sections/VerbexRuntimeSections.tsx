import { useSettings } from '../../../contexts/settings-context'
import { t } from '../../../i18n'
import { OperationCategory } from '../../../permissions/PermissionManager'
import { VerbexSettings } from '../../../settings/schema/setting.types'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextArea } from '../../common/ObsidianTextArea'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ObsidianToggle } from '../../common/ObsidianToggle'

type VerbexRuntimeSettings = VerbexSettings['verbex']

function getSearchModeOptions() {
  return {
    bm25: t('settings.search.searchModeOptions.bm25'),
    embedding: t('settings.search.searchModeOptions.embedding'),
    hybrid: t('settings.search.searchModeOptions.hybrid'),
  }
}

function getCurrentNoteModeOptions() {
  return {
    auto: t('settings.context.currentNoteModeOptions.auto'),
    fullWhenFits: t('settings.context.currentNoteModeOptions.fullWhenFits'),
    snippet: t('settings.context.currentNoteModeOptions.snippet'),
  }
}

function getFirstTurnContextModeOptions() {
  return {
    auto: 'Auto (planner decides)',
    full: 'Full context bodies',
    catalog: 'Catalog references only',
    off: 'Off (tools only)',
  }
}

function getPermissionOptions() {
  return {
    read_only: t('settings.permissionsSection.permissionOptions.read_only'),
    diff_only: t('settings.permissionsSection.permissionOptions.diff_only'),
    approve_write: t(
      'settings.permissionsSection.permissionOptions.approve_write',
    ),
    auto: t('settings.permissionsSection.permissionOptions.auto'),
    session_trust: t(
      'settings.permissionsSection.permissionOptions.session_trust',
    ),
    forbidden: t('settings.permissionsSection.permissionOptions.forbidden'),
  }
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
}

function csv(value: string): OperationCategory[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean) as OperationCategory[]
}

export function VerbexSearchSection() {
  const { settings, setSettings } = useSettings()
  const search = settings.verbex.search
  const relatedNotes = settings.verbex.relatedNotes

  const update = async (next: Partial<VerbexRuntimeSettings['search']>) => {
    await setSettings({
      ...settings,
      verbex: {
        ...settings.verbex,
        search: { ...search, ...next },
      },
    })
  }

  const updateRelatedNotes = async (
    next: Partial<VerbexRuntimeSettings['relatedNotes']>,
  ) => {
    await setSettings({
      ...settings,
      verbex: {
        ...settings.verbex,
        relatedNotes: { ...relatedNotes, ...next },
      },
    })
  }

  return (
    <div className="verbex-settings-section">
      <div className="verbex-settings-header">{t('settings.search.title')}</div>

      <ObsidianSetting
        name={t('settings.search.searchMode.name')}
        desc={t('settings.search.searchMode.desc')}
      >
        <ObsidianDropdown
          value={search.mode}
          options={getSearchModeOptions()}
          onChange={(value) => {
            void update({
              mode: value as VerbexRuntimeSettings['search']['mode'],
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.search.bm25TopK.name')}
        desc={t('settings.search.bm25TopK.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(search.topK)}
          onChange={(value) => {
            void update({ topK: numberValue(value, search.topK) })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.search.candidateMultiplier.name')}
        desc={t('settings.search.candidateMultiplier.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(search.candidateMultiplier)}
          onChange={(value) => {
            void update({
              candidateMultiplier: numberValue(
                value,
                search.candidateMultiplier,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.search.linkExpansionDepth.name')}
        desc={t('settings.search.linkExpansionDepth.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(search.linkExpansionDepth)}
          onChange={(value) => {
            void update({
              linkExpansionDepth: numberValue(value, search.linkExpansionDepth),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.search.relatedNotesAutoRefresh.name')}
        desc={t('settings.search.relatedNotesAutoRefresh.desc')}
      >
        <ObsidianToggle
          value={relatedNotes.autoRefresh}
          onChange={(value) => void updateRelatedNotes({ autoRefresh: value })}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.search.relatedNotesLimit.name')}
        desc={t('settings.search.relatedNotesLimit.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(relatedNotes.limit)}
          onChange={(value) =>
            void updateRelatedNotes({
              limit: numberValue(value, relatedNotes.limit),
            })
          }
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.search.excludePaths.name')}
        desc={t('settings.search.excludePaths.desc')}
        className="verbex-settings-textarea"
      >
        <ObsidianTextArea
          value={search.excludePaths.join('\n')}
          onChange={(value) => {
            void update({ excludePaths: lines(value) })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.search.embeddingModelAndReranker.name')}
        desc={t('settings.search.embeddingModelAndReranker.desc')}
      />
    </div>
  )
}

export function VerbexPermissionsSection() {
  const { settings, setSettings } = useSettings()
  const permissions = settings.verbex.permissions

  const update = async (
    next: Partial<VerbexRuntimeSettings['permissions']>,
  ) => {
    await setSettings({
      ...settings,
      verbex: {
        ...settings.verbex,
        permissions: { ...permissions, ...next },
      },
    })
  }

  return (
    <div className="verbex-settings-section">
      <div className="verbex-settings-header">
        {t('settings.permissionsSection.title')}
      </div>

      <ObsidianSetting
        name={t('settings.permissionsSection.defaultPermission.name')}
        desc={t('settings.permissionsSection.defaultPermission.desc')}
      >
        <ObsidianDropdown
          value={permissions.defaultPermission}
          options={getPermissionOptions()}
          onChange={(value) => {
            void update({
              defaultPermission:
                value as VerbexRuntimeSettings['permissions']['defaultPermission'],
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.permissionsSection.alwaysRequireApproval.name')}
        desc={t('settings.permissionsSection.alwaysRequireApproval.desc')}
      >
        <ObsidianToggle
          value={permissions.alwaysRequireApproval}
          onChange={(value) => {
            void update({ alwaysRequireApproval: value })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.permissionsSection.autoModeDefault.name')}
        desc={t('settings.permissionsSection.autoModeDefault.desc')}
      >
        <ObsidianToggle
          value={permissions.autoModeDefault}
          onChange={(value) => {
            void update({ autoModeDefault: value })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.permissionsSection.autoModeTimeout.name')}
        desc={t('settings.permissionsSection.autoModeTimeout.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(permissions.autoModeTimeoutSeconds)}
          onChange={(value) => {
            void update({
              autoModeTimeoutSeconds: numberValue(
                value,
                permissions.autoModeTimeoutSeconds,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.permissionsSection.alwaysConfirmCategories.name')}
        desc={t('settings.permissionsSection.alwaysConfirmCategories.desc')}
      >
        <ObsidianTextInput
          value={permissions.autoModeExclude.join(', ')}
          onChange={(value) => {
            void update({ autoModeExclude: csv(value) })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.permissionsSection.checkpointBeforeWrite.name')}
        desc={t('settings.permissionsSection.checkpointBeforeWrite.desc')}
      >
        <ObsidianToggle
          value={permissions.checkpointBeforeWrite}
          onChange={(value) => {
            void update({ checkpointBeforeWrite: value })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.permissionsSection.allowExternalApiTools.name')}
        desc={t('settings.permissionsSection.allowExternalApiTools.desc')}
      >
        <ObsidianToggle
          value={permissions.allowExternalApi}
          onChange={(value) => {
            void update({ allowExternalApi: value })
          }}
        />
      </ObsidianSetting>
    </div>
  )
}

export function VerbexContextSection() {
  const { settings, setSettings } = useSettings()
  const context = settings.verbex.context

  const update = async (next: Partial<VerbexRuntimeSettings['context']>) => {
    await setSettings({
      ...settings,
      verbex: {
        ...settings.verbex,
        context: { ...context, ...next },
      },
    })
  }

  return (
    <div className="verbex-settings-section">
      <div className="verbex-settings-header">
        {t('settings.context.title')}
      </div>

      <ObsidianSetting
        name={t('settings.context.contextBudgetMode.name')}
        desc={t('settings.context.contextBudgetMode.desc')}
      >
        <ObsidianDropdown
          value={context.contextBudgetMode}
          options={{
            auto: t('settings.context.contextBudgetOptions.auto'),
            custom: t('settings.context.contextBudgetOptions.custom'),
          }}
          onChange={(value) => {
            void update({ contextBudgetMode: value as 'auto' | 'custom' })
          }}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name={t('settings.context.maxContextTokens.name')}
        desc={t('settings.context.maxContextTokens.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.maxContextTokens)}
          onChange={(value) => {
            void update({
              maxContextTokens: numberValue(value, context.maxContextTokens),
              contextBudgetMode: 'custom',
            })
          }}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name="First-turn context mode"
        desc="Choose who controls automatic retrieval for the first turn. Auto lets the planner select full, catalog, or off; explicit attachments, digests, and workflow grounding remain protected."
      >
        <ObsidianDropdown
          value={context.firstTurnMode}
          options={getFirstTurnContextModeOptions()}
          onChange={(value) => {
            void update({
              firstTurnMode:
                value as VerbexRuntimeSettings['context']['firstTurnMode'],
              autoContext: value !== 'off',
            })
          }}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name="Catalog token budget"
        desc="Maximum estimated tokens for bodyless retrieval candidates in catalog mode."
      >
        <ObsidianTextInput
          type="number"
          value={String(context.catalogTokenBudget)}
          onChange={(value) => {
            void update({
              catalogTokenBudget: numberValue(
                value,
                context.catalogTokenBudget,
              ),
            })
          }}
        />
      </ObsidianSetting>
      <ObsidianSetting
        name="Catalog candidate limit"
        desc="Maximum number of bodyless candidate references shown in catalog mode."
      >
        <ObsidianTextInput
          type="number"
          value={String(context.catalogCandidateLimit)}
          onChange={(value) => {
            void update({
              catalogCandidateLimit: numberValue(
                value,
                context.catalogCandidateLimit,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.splitLargeFiles.name')}
        desc={t('settings.context.splitLargeFiles.desc')}
      >
        <ObsidianToggle
          value={context.autoSplitLargeInput}
          onChange={(value) => {
            void update({ autoSplitLargeInput: value })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.attachmentDigestRatio.name')}
        desc={t('settings.context.attachmentDigestRatio.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.attachmentDigestTokenThresholdRatio)}
          onChange={(value) => {
            void update({
              attachmentDigestTokenThresholdRatio: numberValue(
                value,
                context.attachmentDigestTokenThresholdRatio,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.currentNoteMode.name')}
        desc={t('settings.context.currentNoteMode.desc')}
      >
        <ObsidianDropdown
          value={context.currentNoteMode}
          options={getCurrentNoteModeOptions()}
          onChange={(value) => {
            void update({
              currentNoteMode:
                value as VerbexRuntimeSettings['context']['currentNoteMode'],
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.currentNoteTokenBudget.name')}
        desc={t('settings.context.currentNoteTokenBudget.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.currentNoteTokenBudget)}
          onChange={(value) => {
            void update({
              currentNoteTokenBudget: numberValue(
                value,
                context.currentNoteTokenBudget,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.reservedOutputTokens.name')}
        desc={t('settings.context.reservedOutputTokens.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.reservedOutputTokens)}
          onChange={(value) => {
            void update({
              reservedOutputTokens: numberValue(
                value,
                context.reservedOutputTokens,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.mapReduceChunkRatio.name')}
        desc={t('settings.context.mapReduceChunkRatio.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.mapReduceChunkRatio)}
          onChange={(value) => {
            void update({
              mapReduceChunkRatio: numberValue(
                value,
                context.mapReduceChunkRatio,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.mapReduceStepTimeout.name')}
        desc={t('settings.context.mapReduceStepTimeout.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.mapReduceTimeoutMs)}
          onChange={(value) => {
            void update({
              mapReduceTimeoutMs: numberValue(
                value,
                context.mapReduceTimeoutMs,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.largeFileConfirmThreshold.name')}
        desc={t('settings.context.largeFileConfirmThreshold.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.largeFileConfirmChunkThreshold)}
          onChange={(value) => {
            void update({
              largeFileConfirmChunkThreshold: numberValue(
                value,
                context.largeFileConfirmChunkThreshold,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.batchCallsPerTurn.name')}
        desc={t('settings.context.batchCallsPerTurn.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.batchMaxCompletionCallsPerTurn)}
          onChange={(value) => {
            void update({
              batchMaxCompletionCallsPerTurn: numberValue(
                value,
                context.batchMaxCompletionCallsPerTurn,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.batchWallTimePerTurn.name')}
        desc={t('settings.context.batchWallTimePerTurn.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.batchMaxWallTimeMsPerTurn)}
          onChange={(value) => {
            void update({
              batchMaxWallTimeMsPerTurn: numberValue(
                value,
                context.batchMaxWallTimeMsPerTurn,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.summaryWikiTokenBudget.name')}
        desc={t('settings.context.summaryWikiTokenBudget.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.wikiTokenBudget)}
          onChange={(value) => {
            void update({
              wikiTokenBudget: numberValue(value, context.wikiTokenBudget),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.searchResultTokenBudget.name')}
        desc={t('settings.context.searchResultTokenBudget.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.searchResultTokenBudget)}
          onChange={(value) => {
            void update({
              searchResultTokenBudget: numberValue(
                value,
                context.searchResultTokenBudget,
              ),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.skillTokenBudget.name')}
        desc={t('settings.context.skillTokenBudget.desc')}
      >
        <ObsidianTextInput
          type="number"
          value={String(context.skillTokenBudget)}
          onChange={(value) => {
            void update({
              skillTokenBudget: numberValue(value, context.skillTokenBudget),
            })
          }}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('settings.context.contextCompaction.name')}
        desc={t('settings.context.contextCompaction.desc')}
      />
    </div>
  )
}
