import { useEffect, useState } from 'react'

import { t } from '../../i18n'
import type { NativeProviderHost } from '../../provider/interop/NativeProviderHost'
import type { SessionGrant } from '../../provider/interop/sessionGrants'

import { revokeSessionGrant } from './revokeSessionGrant'

export default function SessionGrants({
  host,
  conversationId,
}: {
  host: NativeProviderHost
  conversationId: string
}) {
  const [grants, setGrants] = useState<SessionGrant[]>([])
  const [notice, setNotice] = useState('')
  const capture = host.options?.outputAnchorCapture
  const [captureEnabled, setCaptureEnabled] = useState(false)
  useEffect(() => {
    const update = () =>
      setGrants(
        host.grants
          .list()
          .filter((grant) => grant.conversationId === conversationId),
      )
    update()
    setNotice('')
    return host.grants.subscribe(update)
  }, [host, conversationId])
  useEffect(() => {
    const update = () => setCaptureEnabled(!!capture?.requested(conversationId))
    update()
    return capture?.subscribe(update)
  }, [capture, conversationId])
  if (!grants.length && !notice && !capture) return null
  return (
    <>
      {capture && conversationId && (
        <div className="verbex-session-grants">
          <button
            type="button"
            aria-pressed={captureEnabled}
            onClick={() => {
              if (capture.requested(conversationId))
                capture.release(conversationId)
              else capture.enable(conversationId)
              setCaptureEnabled(!!capture.requested(conversationId))
            }}
          >
            {captureEnabled
              ? t('ui.SessionGrants.turnOffSavedParagraphLocationCollection')
              : t('ui.SessionGrants.turnOnSavedParagraphLocationCollection')}
          </button>
          {captureEnabled && (
            <span>
              {' '}
              {t('ui.SessionGrants.appliesToSubsequentHWPXSavesInThis')}
            </span>
          )}
        </div>
      )}
      {(grants.length > 0 || notice) && (
        <div
          className="verbex-session-grants"
          role="group"
          aria-label={t(
            'ui.SessionGrants.documentEditingApprovalForThisConversation',
          )}
        >
          {grants.length > 0 && (
            <strong>
              {t(
                'ui.SessionGrants.documentEditingApprovalForThisConversation2',
              )}
            </strong>
          )}
          {grants.map((grant) => (
            <div key={`${grant.providerId}:${grant.path}`}>
              <span title={grant.path}>
                {grant.path.split('/').pop() ?? grant.path}
              </span>{' '}
              <button
                onClick={() => {
                  revokeSessionGrant(host, grant, setNotice)
                }}
              >
                {t('ui.SessionGrants.revokeEditingApproval')}
              </button>
            </div>
          ))}
          {notice && <p role="status">{notice}</p>}
        </div>
      )}
    </>
  )
}
