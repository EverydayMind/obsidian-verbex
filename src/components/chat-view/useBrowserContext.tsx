import type { App } from 'obsidian'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useWebHandsEnabled } from '../../hooks/useWebHandsEnabled'
import { t } from '../../i18n'
import {
  type BrowserSelection,
  type BrowserTurnContext,
  browserHoldLabel,
} from '../../provider/interop/browserContext'
import { browserReadAccessLabel } from '../../provider/interop/browserReadAccess'
import type { NativeProviderHost } from '../../provider/interop/NativeProviderHost'
import { isWebHandsEnabled } from '../../provider/interop/webHands'
import { coerceString } from '../../utils/coerceString'

const labels: Record<string, string> = {
  ambiguous: t('ui.useBrowserContext.selectATargetWebTab'),
  none: t('ui.useBrowserContext.noOpenWebTabs'),
  read_disabled: t('ui.useBrowserContext.webHandsReadingIsOff'),
  unavailable: t('ui.useBrowserContext.webTabUnavailable'),
  tab_not_found: t('ui.useBrowserContext.noOpenWebTabs2'),
  tab_not_visible: t('ui.useBrowserContext.webTabIsHidden'),
  tab_deferred: t('ui.useBrowserContext.webTabHasNotLoaded'),
}

/** Selection belongs to this conversation; captured execution metadata never goes to disk. */
export function useBrowserContext(
  host: NativeProviderHost,
  app: App,
  conversationId: string,
) {
  const choice = useRef(new Map<string, BrowserSelection>())
  const workspace = app.workspace
  const enabled = useWebHandsEnabled(app)
  const sequence = useRef(0)
  const [state, setState] = useState<{
    conversationId: string
    context?: BrowserTurnContext
  }>({ conversationId })
  const selection = () => choice.current.get(conversationId)
  const capture = useCallback(
    async () =>
      isWebHandsEnabled(app)
        ? host.browserContext(
            conversationId,
            choice.current.get(conversationId),
          )
        : undefined,
    [app, host, conversationId],
  )
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    const context = await capture()
    if (request === sequence.current) setState({ conversationId, context })
  }, [capture, conversationId])
  useEffect(() => {
    const requestSequence = sequence
    void refresh()
    const refs = [
      workspace.on('active-leaf-change', () => void refresh()),
      workspace.on('layout-change', () => void refresh()),
    ]
    const off = host.onReady(() => void refresh())
    return () => {
      requestSequence.current++
      refs.forEach((ref) => workspace.offref(ref))
      off()
    }
  }, [host, workspace, refresh, enabled])
  const context =
    state.conversationId === conversationId ? state.context : undefined
  const scopes = context?.scopes ?? []
  const tabs = scopes.flatMap((scope) =>
    scope.tabs.map((tab) => ({ scope, tab })),
  )
  const selected = selection()
  const value =
    selected === 'off'
      ? 'off'
      : selected
        ? JSON.stringify([selected.providerId, selected.tabId])
        : 'auto'
  const targets = scopes.filter((s) => s.status === 'ready')
  const description =
    selected === 'off'
      ? t('ui.useBrowserContext.webTabContextCleared')
      : targets.length === 1
        ? [
            coerceString(
              targets[0].target?.title ??
                targets[0].target?.origin ??
                targets[0].target?.tabId,
            ),
            browserReadAccessLabel(targets[0].target),
          ]
            .filter(Boolean)
            .join(' · ')
        : scopes.length
          ? scopes
              .map((s) =>
                s.status === 'held'
                  ? browserHoldLabel(s.hold)
                  : (labels[s.status] ?? s.status),
              )
              .join(' · ')
          : t('ui.useBrowserContext.checkWebToolApprovalAndReadingSettings')
  const control = (
    <div className="verbex-browser-context">
      <label>
        {t('ui.useBrowserContext.webTab')}{' '}
        <select
          aria-label={t('ui.useBrowserContext.webTabTarget')}
          value={value}
          onChange={(event) => {
            const next = event.target.value
            const found = tabs.find(
              ({ scope, tab }) =>
                JSON.stringify([scope.providerId, tab.tabId]) === next,
            )
            const selected: BrowserSelection | undefined =
              next === 'off'
                ? 'off'
                : found
                  ? {
                      providerId: found.scope.providerId,
                      tabId: coerceString(found.tab.tabId),
                      incarnation: coerceString(found.tab.incarnation),
                    }
                  : undefined
            if (selected) choice.current.set(conversationId, selected)
            else choice.current.delete(conversationId)
            void refresh()
          }}
        >
          <option value="auto">
            {t('ui.useBrowserContext.autoMostRecentlyUsedTab')}
          </option>
          <option value="off">{t('ui.useBrowserContext.off')}</option>
          {selected &&
            selected !== 'off' &&
            !tabs.some(
              ({ scope, tab }) =>
                scope.providerId === selected.providerId &&
                tab.tabId === selected.tabId,
            ) && (
              <option value={value}>
                {t('ui.useBrowserContext.selectedTabUnavailable')}
              </option>
            )}
          {tabs.map(({ scope, tab }) => (
            <option
              key={`${scope.providerId}:${coerceString(tab.tabId)}`}
              value={JSON.stringify([scope.providerId, tab.tabId])}
            >
              {coerceString(tab.title ?? tab.origin ?? tab.tabId)}
              {browserReadAccessLabel(tab)
                ? ` · ${browserReadAccessLabel(tab)}`
                : ''}
              {tab.visible ? '' : t('ui.useBrowserContext.hidden')}
            </option>
          ))}
        </select>
      </label>
      <span title={description}>{description}</span>
      <button
        type="button"
        onClick={() => void refresh()}
        aria-label={t('ui.useBrowserContext.refreshWebTabs')}
      >
        ↻
      </button>
    </div>
  )
  return { capture, control: enabled ? control : null }
}
