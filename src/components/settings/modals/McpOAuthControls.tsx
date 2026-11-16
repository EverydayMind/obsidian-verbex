import { useEffect, useRef, useState } from 'react'

import { isOAuth } from '../../../core/mcp/oauthStore'
import { t } from '../../../i18n'
import type VerbexPlugin from '../../../main'
import type { McpServerParameters } from '../../../types/mcp.types'

export function McpOAuthControls({
  plugin,
  parameters,
  configurationKey,
  serverId,
}: {
  plugin: VerbexPlugin
  parameters: () => McpServerParameters
  configurationKey: string
  serverId?: string
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const controller = useRef<AbortController>()
  const mounted = useRef(true)
  useEffect(
    () => () => {
      mounted.current = false
      controller.current?.abort()
    },
    [],
  )
  useEffect(() => {
    setStatus('')
    return () => controller.current?.abort()
  }, [configurationKey])
  const reconnect = async () => {
    if (serverId && plugin.mcpManager)
      await plugin.mcpManager.reconnectServer(serverId)
  }
  const login = async () => {
    const active = new AbortController()
    controller.current = active
    setBusy(true)
    setStatus(t('ui.McpOAuthControls.completeBrowserSignInAndConsentClosing'))
    try {
      const value = parameters()
      if (!isOAuth(value)) return
      await plugin.mcpOAuth.login(value, active.signal)
      active.signal.throwIfAborted()
      await reconnect()
      if (!active.signal.aborted)
        setStatus(t('ui.McpOAuthControls.signedInTestTheConnectionToCheck'))
    } catch (error) {
      if (!active.signal.aborted)
        setStatus(
          error instanceof Error
            ? error.message
            : t('ui.McpOAuthControls.oAuthSignInFailed'),
        )
    } finally {
      if (controller.current === active) {
        controller.current = undefined
        if (mounted.current) setBusy(false)
      }
    }
  }
  return (
    <div>
      <p>
        {t(
          'ui.McpOAuthControls.discoverServiceAuthenticationAndRegisterVerbexThrough',
        )}
      </p>
      <button type="button" onClick={() => void login()} disabled={busy}>
        {t('ui.McpOAuthControls.browserSignInSignInAgain')}
      </button>{' '}
      {busy && (
        <button
          type="button"
          onClick={() => {
            controller.current?.abort()
            setStatus(t('ui.McpOAuthControls.signInCancelled'))
          }}
        >
          {t('ui.McpOAuthControls.cancelSignIn')}
        </button>
      )}{' '}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          try {
            const value = parameters()
            if (isOAuth(value)) {
              plugin.mcpOAuth.logout(value)
              void reconnect()
              setStatus(
                t('ui.McpOAuthControls.signInCredentialsDeletedFromThisDevice'),
              )
            }
          } catch (error) {
            setStatus(
              error instanceof Error
                ? error.message
                : t('ui.McpOAuthControls.couldNotDeleteSignInCredentials'),
            )
          }
        }}
      >
        {t('ui.McpOAuthControls.deleteSignInCredentials')}
      </button>
      {status && <p role="status">{status}</p>}
    </div>
  )
}
