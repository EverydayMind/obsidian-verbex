import { t } from '../../../i18n'
import type VerbexPlugin from '../../../main'
import type { NativeProviderStatus } from '../../../provider/interop/hostScanTypes'
import { statusPluginLabel } from '../../../provider/interop/pluginDisplayName'
import type { NativeProviderApproval } from '../../../provider/interop/protocol'
import { ReactModal } from '../../common/ReactModal'

import { NativeProviderDefinition } from './NativeProviderDefinition'
import { NativeReapprovalReview } from './NativeReapprovalReview'
export type Decision = 'approve' | 'skip' | 'stop'
type Props = {
  /** Display-only plugin label, `Name (id)`. */
  label: string
  status: NativeProviderStatus
  previous?: NativeProviderApproval
  decide: (decision: Decision) => void
  onClose: () => void
}

function Review({ label, status, previous, decide, onClose }: Props) {
  const choose = (decision: Decision) => {
    decide(decision)
    onClose()
  }
  return (
    <div className="verbex-native-approval-review">
      <p>
        <strong>{label}</strong> · v{status.pluginVersion}{' '}
        {t('ui.NativeSequentialApproval.tools')}{' '}
        {status.descriptor?.tools.length ?? 0}
        {t('ui.NativeSequentialApproval.tools2')}{' '}
        {status.state === 'pending'
          ? t('ui.NativeSequentialApproval.awaitingApproval')
          : t('ui.NativeSequentialApproval.reapprove')}
      </p>
      <div className="verbex-native-approval-body">
        {status.state === 'reapproval' && previous && (
          <NativeReapprovalReview status={status} approval={previous} />
        )}
        <NativeProviderDefinition status={status} />
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
