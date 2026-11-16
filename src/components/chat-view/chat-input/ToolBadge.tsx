import * as Popover from '@radix-ui/react-popover'
import { useState } from 'react'

import { useApp } from '../../../contexts/app-context'
import { usePlugin } from '../../../contexts/plugin-context'
import { useSettings } from '../../../contexts/settings-context'
import { SIMPLE_CORE_TOOL_NAMES } from '../../../core/tools/toolDefinitions'
import { t } from '../../../i18n'
import {
  TOOL_APPROVAL_LABELS,
  TOOL_SOURCE_LABELS,
  ToolApprovalState,
  ToolSourceKind,
  catalogCounts,
} from '../../../tools/catalogTypes'
import { ToolGrouping, groupCatalog } from '../../../tools/catalogView'
import type { ConversationToolSelection } from '../../../tools/conversationToolPolicy'
import { useToolCatalog } from '../../../tools/useToolCatalog'
import { ToolCatalogControls } from '../../common/ToolCatalogControls'
import { ToolManagementModal } from '../../modals/ToolManagementModal'

export default function ToolBadge({
  selection = {},
  onChange,
}: {
  selection?: ConversationToolSelection
  onChange?: (selection: ConversationToolSelection) => void
}) {
  const app = useApp()
  const plugin = usePlugin()
  const { settings } = useSettings()
  const [open, setOpen] = useState(false)
  // Opening the list restarts the catalog effect, so it refreshes at once.
  const { tools, error } = useToolCatalog(app, plugin, settings, {
    live: open,
  })
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null)
  const [filter, setFilter] = useState<ToolSourceKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [grouping, setGrouping] = useState<ToolGrouping>('plugin')
  const [approval, setApproval] = useState<ToolApprovalState | 'all'>('all')
  const counts = catalogCounts(tools)
  const groups = groupCatalog(tools, {
    grouping,
    source: filter,
    approval,
    query,
  })
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={setTrigger}
          type="button"
          className="verbex-connector-picker"
          title={t(
            'ui.ToolBadge.toolCandidatesAndReadinessForThisConversation',
          )}
        >
          {t('ui.ToolBadge.tools')}
          {counts.candidates})
        </button>
      </Popover.Trigger>
      <Popover.Portal container={trigger?.ownerDocument.body}>
        <Popover.Content
          className="verbex-connector-picker-menu"
          aria-label={t('ui.ToolBadge.toolSelectionForThisConversation')}
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          sticky="always"
        >
          <p>
            {t('ui.ToolBadge.registered')}
            {counts.registered} {t('ui.ToolBadge.ready')}
            {counts.ready} {t('ui.ToolBadge.callCandidates')}{' '}
            {counts.candidates}
          </p>
          <p>
            {t('ui.ToolBadge.lastSuccessfulModelRequestExposure')}{' '}
            {plugin.toolProviderHub?.lastExposure?.names.length ??
              t('ui.ToolBadge.noneYet')}
          </p>
          <p>
            {t('ui.ToolBadge.pinsSelectCandidatesExecutionApprovalAndSkill')}
          </p>
          <p>{t('ui.ToolBadge.requiredBasicToolsAndToolsRequiredBy')}</p>
          <div
            className="verbex-tool-filters"
            role="group"
            aria-label={t('ui.ToolBadge.toolCategory')}
          >
            {(['all', 'builtin', 'plugin', 'mcp'] as const).map((kind) => (
              <button
                key={kind}
                aria-pressed={filter === kind}
                onClick={() => setFilter(kind)}
              >
                {kind === 'all'
                  ? t('ui.ToolBadge.all')
                  : TOOL_SOURCE_LABELS[kind]}
              </button>
            ))}
          </div>
          <ToolCatalogControls
            grouping={grouping}
            approval={approval}
            onGroupingChange={setGrouping}
            onApprovalChange={setApproval}
          />
          <input
            type="search"
            aria-label={t('ui.ToolBadge.searchConversationTools')}
            placeholder={t('ui.ToolBadge.searchCapabilitiesAndProviders')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              new ToolManagementModal(app, plugin).open()
            }}
          >
            {t('ui.ToolBadge.toolManagement')}
          </button>
          {groups.map((group) => (
            <details
              key={`${grouping}:${group.key}`}
              className="verbex-tool-group"
            >
              <summary>
                {group.title} · {group.tools.length}
                {t('ui.ToolBadge.tools2')}
              </summary>
              {group.tools.map((tool) => (
                <label key={tool.name} className="verbex-tool-choice">
                  <span>
                    {tool.title} · {tool.providerId}
                    <small>
                      {tool.status} · {TOOL_APPROVAL_LABELS[tool.approval]}
                      {tool.action ? ` · ${tool.action}` : ''}
                      {SIMPLE_CORE_TOOL_NAMES.has(tool.name)
                        ? t('ui.ToolBadge.requiredBasicTool')
                        : ''}
                    </small>
                  </span>
                  <select
                    aria-label={t('ui.ToolBadge.selectionForThisConversation', {
                      p0: tool.title,
                    })}
                    disabled={
                      !onChange ||
                      !tool.enabled ||
                      !tool.ready ||
                      !tool.agentCallable
                    }
                    value={
                      selection.excluded?.includes(tool.name)
                        ? 'excluded'
                        : selection.pinned?.includes(tool.name)
                          ? 'pinned'
                          : 'auto'
                    }
                    onChange={(event) => {
                      const pinned = (selection.pinned ?? []).filter(
                        (name) => name !== tool.name,
                      )
                      const excluded = (selection.excluded ?? []).filter(
                        (name) => name !== tool.name,
                      )
                      onChange?.({
                        pinned:
                          event.target.value === 'pinned'
                            ? [...pinned, tool.name]
                            : pinned,
                        excluded:
                          event.target.value === 'excluded'
                            ? [...excluded, tool.name]
                            : excluded,
                      })
                    }}
                  >
                    <option value="auto">{t('ui.ToolBadge.auto')}</option>
                    <option value="pinned">{t('ui.ToolBadge.pin')}</option>
                    <option
                      value="excluded"
                      disabled={SIMPLE_CORE_TOOL_NAMES.has(tool.name)}
                    >
                      {t('ui.ToolBadge.exclude')}
                    </option>
                  </select>
                </label>
              ))}
            </details>
          ))}
          {groups.length === 0 && <p>{t('ui.ToolBadge.noMatchingTools')}</p>}
          {error && <p role="alert">{error}</p>}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
