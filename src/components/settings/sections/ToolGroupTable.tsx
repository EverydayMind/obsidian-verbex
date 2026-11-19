import { useId, useState } from 'react'

import { t } from '../../../i18n'
import {
  type CatalogTool,
  TOOL_APPROVAL_LABELS,
  TOOL_EFFECT_LABELS,
  TOOL_SOURCE_LABELS,
} from '../../../tools/catalogTypes'
import {
  type CatalogGroup,
  catalogProviderLabel,
} from '../../../tools/catalogView'

function ToolRow({
  tool,
  pluginName,
}: {
  tool: CatalogTool
  pluginName?: (id: string) => string | undefined
}) {
  const [open, setOpen] = useState(false)
  const detailId = useId()
  return (
    <>
      <tr>
        <th scope="row">{tool.title}</th>
        <td>{catalogProviderLabel(tool, pluginName, true)}</td>
        <td>{tool.status}</td>
        <td>
          {
            TOOL_APPROVAL_LABELS[
              tool.approval === 'perCall' || tool.approval === 'automatic'
                ? 'notRequired'
                : tool.approval
            ]
          }
        </td>
        <td>
          {tool.effects.map((effect) => TOOL_EFFECT_LABELS[effect]).join(', ')}
        </td>
        <td>
          <button
            type="button"
            aria-label={t('ui.ToolGroupTable.details', { p0: tool.title })}
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen(!open)}
          >
            {t('ui.ToolGroupTable.details2')}
          </button>
        </td>
      </tr>
      <tr id={detailId} hidden={!open}>
        <td colSpan={6}>
          <p>{tool.description}</p>
          <p>
            {TOOL_SOURCE_LABELS[tool.sourceKind]} ·{' '}
            {tool.sourceKind === 'mcp'
              ? t('ui.ToolGroupTable.externalServer')
              : tool.providerKind === 'community'
                ? t('ui.ToolGroupTable.community')
                : t('ui.ToolGroupTable.obsidianPublicAPIVerbex')}
          </p>
          <p>
            {tool.effects.includes('vaultWrite')
              ? t(
                  'ui.ToolGroupTable.vaultChangesPermissionCheckDiffProposalApproval',
                )
              : tool.effects.includes('sessionEdit')
                ? t('ui.ToolGroupTable.editsTheWorkingCopyOfAnOpen')
                : t('ui.ToolGroupTable.readAndCalculationResultsMayLaterBe')}
          </p>
          {tool.approval === 'perCall' && (
            <p>
              {t('ui.ToolGroupTable.executionApprovalIsRequiredForEachCall')}
            </p>
          )}
          {tool.approval === 'automatic' && (
            <p>{t('ui.ToolGroupTable.executionIsAutomaticallyAllowed')}</p>
          )}
          {tool.action && <p>{tool.action}</p>}
          {tool.definition && (
            <details>
              <summary>{t('ui.ToolGroupTable.advancedDefinitions')}</summary>
              <code>{tool.name}</code>
              <pre>
                {JSON.stringify(tool.definition.function.parameters, null, 2)}
              </pre>
            </details>
          )}
        </td>
      </tr>
    </>
  )
}

export function ToolGroupTable({
  group,
  pluginName,
}: {
  group: CatalogGroup
  pluginName?: (id: string) => string | undefined
}) {
  return (
    <div className="verbex-tool-table-container">
      <table className="verbex-tool-table">
        <caption>
          {group.title} {t('ui.ToolGroupTable.groupTools')}
        </caption>
        <thead>
          <tr>
            {[
              t('ui.ToolGroupTable.tool'),
              t('ui.ToolGroupTable.provider'),
              t('ui.ToolGroupTable.readiness'),
              t('ui.ToolGroupTable.definitionApproval'),
              t('ui.ToolGroupTable.changes'),
              t('ui.ToolGroupTable.details3'),
            ].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.tools.map((tool) => (
            <ToolRow key={tool.name} tool={tool} pluginName={pluginName} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
