import { t } from '../../i18n'
import {
  TOOL_APPROVAL_LABELS,
  type ToolApprovalState,
} from '../../tools/catalogTypes'
import type { ToolGrouping } from '../../tools/catalogView'

export function ToolCatalogControls({
  grouping,
  approval,
  onGroupingChange,
  onApprovalChange,
}: {
  grouping: ToolGrouping
  approval: ToolApprovalState | 'all'
  onGroupingChange: (value: ToolGrouping) => void
  onApprovalChange: (value: ToolApprovalState | 'all') => void
}) {
  return (
    <div className="verbex-tool-view-controls">
      <div
        className="verbex-tool-filters"
        role="group"
        aria-label={t('ui.ToolCatalogControls.groupBy')}
      >
        <button
          type="button"
          aria-pressed={grouping === 'plugin'}
          onClick={() => onGroupingChange('plugin')}
        >
          {t('ui.ToolCatalogControls.groupByPlugin')}
        </button>
        <button
          type="button"
          aria-pressed={grouping === 'approval'}
          onClick={() => onGroupingChange('approval')}
        >
          {t('ui.ToolCatalogControls.groupByApprovalStatus')}
        </button>
      </div>
      <label>
        {t('ui.ToolCatalogControls.approvalStatus')}{' '}
        <select
          value={approval}
          onChange={(event) =>
            onApprovalChange(event.target.value as ToolApprovalState | 'all')
          }
        >
          <option value="all">
            {t('ui.ToolCatalogControls.allApprovalStatuses')}
          </option>
          {Object.entries(TOOL_APPROVAL_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
