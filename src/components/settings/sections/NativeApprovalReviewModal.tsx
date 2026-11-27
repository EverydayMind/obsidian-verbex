import { t } from '../../../i18n'
import { tCount } from '../../../i18n/tCount'
import type VerbexPlugin from '../../../main'
import { displayReaderFor } from '../../../provider/interop/hostCapabilities/skillDisplayRead'
import type { NativeProviderStatus } from '../../../provider/interop/hostScanTypes'
import { statusPluginLabel } from '../../../provider/interop/pluginDisplayName'
import type { NativeProviderApproval } from '../../../provider/interop/protocol'
import { ReactModal } from '../../common/ReactModal'

import { NativeProviderDefinition } from './NativeProviderDefinition'
import { NativeReapprovalReview } from './NativeReapprovalReview'
import type { ReadSkillBody } from './NativeSkillBodyView'
export type Decision = 'approve' | 'skip' | 'stop'
type Props = {
  /** Display-only plugin label, `Name (id)`. */
  label: string
  status: NativeProviderStatus
  previous?: NativeProviderApproval
  decide: (decision: Decision) => void
  onClose: () => void
  /** Display-only Skill body read for this provider (never used for injection). */
  readSkillBody?: ReadSkillBody
}

function Review({
  label,
  status,
  previous,
  decide,
  onClose,
  readSkillBody,
}: Props) {
  const choose = (decision: Decision) => {
    decide(decision)
    onClose()
  }
  const toolCount = status.descriptor?.tools.length ?? 0
  return (
    <div className="verbex-native-approval-review">
      <p>
        <strong>{label}</strong> · v{status.pluginVersion} ·{' '}
        {tCount(
          toolCount,
          'ui.NativeSequentialApproval.toolCountOne',
          'ui.NativeSequentialApproval.toolCount',
        )}{' '}
        ·{' '}
        {status.state === 'pending'
          ? t('ui.NativeSequentialApproval.awaitingApproval')
          : t('ui.NativeSequentialApproval.reapprove')}
      </p>
      <div className="verbex-native-approval-body">
        {status.state === 'reapproval' && previous && (
          <NativeReapprovalReview status={status} approval={previous} />
        )}
        <NativeProviderDefinition
          status={status}
          readSkillBody={readSkillBody}
        />
      </div>
      <div className="verbex-native-approval-actions">
        <p>
          {t(
            'ui.NativeSequentialApproval.savePermissionCommitGrantAndDisabledTool',
          )}
        </p>
        <button onClick={() => choose('approve')}>
          {t('ui.NativeSequentialApproval.approve')}
        </button>
        <button onClick={() => choose('skip')}>
          {t('ui.NativeSequentialApproval.skip')}
        </button>
        <button onClick={() => choose('stop')}>
          {t('ui.NativeSequentialApproval.stop')}
        </button>
      </div>
    </div>
  )
}

export class ReviewModal extends ReactModal<Props> {
  private finish: (decision: Decision) => void
  constructor(
    plugin: VerbexPlugin,
    status: NativeProviderStatus,
    previous: NativeProviderApproval | undefined,
    finish: (decision: Decision) => void,
  ) {
    super({
      app: plugin.app,
      Component: Review,
      props: {
        label: statusPluginLabel(plugin.app, status),
        status,
        previous,
        decide: finish,
        readSkillBody: displayReaderFor(plugin.nativeProviderHost, status),
      },
      options: { title: t('ui.NativeSequentialApproval.reviewToolApproval') },
    })
    this.finish = finish
  }
  onClose() {
    this.finish('stop')
    super.onClose()
  }
}
