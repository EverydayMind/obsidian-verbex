import { App } from 'obsidian'
import { useState } from 'react'

import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import {
  ConnectorManifest,
  connectorManifestSchema,
} from '../../../provider/connectors/manifestSchema'
import { canonicalDigestJson } from '../../../security/promptInjectionBoundary'
import { ReactModal } from '../../common/ReactModal'

type Props = {
  plugin: VerbexPlugin
  initial?: ConnectorManifest
  onClose: () => void
}
export class PluginConnectorReviewModal extends ReactModal<Props> {
  constructor(app: App, plugin: VerbexPlugin, initial?: ConnectorManifest) {
    super({
      app,
      Component: Review,
      props: { plugin, initial },
      options: {
        title: t('ui.PluginConnectorReviewModal.reviewPluginConnector'),
      },
    })
    this.modalEl.addClass('verbex-plugin-connector-review-modal')
  }
}

function Review({ plugin, initial, onClose }: Props) {
  const [json, setJson] = useState(
    initial ? JSON.stringify(initial, null, 2) : '',
  )
  const [manifest, setManifest] = useState<ConnectorManifest | null>(null)
  const [targetVersion, setTargetVersion] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const review = async () => {
    setBusy(true)
    setManifest(null)
    try {
      if (json.length > 150000)
        throw new Error(
          t('ui.PluginConnectorReviewModal.jSONMustNotExceed150000Characters'),
        )
      await canonicalDigestJson(json)
      const result = await plugin.pluginConnectorHost.review(
        connectorManifestSchema.parse(JSON.parse(json)),
      )
      setManifest(result.manifest)
      setTargetVersion(result.approved.targetVersion)
      setError('')
    } catch (error) {
      setManifest(null)
      setError(
        error instanceof Error
          ? error.message
          : t('ui.PluginConnectorReviewModal.jSONError'),
      )
    } finally {
      setBusy(false)
    }
  }
  const approve = async () => {
    if (!manifest) return
    setBusy(true)
    try {
      const approved = await plugin.pluginConnectorHost.approve(
        manifest,
        targetVersion,
      )
      const settings = plugin.settings
      if (
        settings.pluginConnectors.connectors.filter(
          (entry) => entry.id !== approved.id,
        ).length >= 32
      )
        throw new Error(
          t('ui.PluginConnectorReviewModal.atMost32ConnectorsCanBeRegistered'),
        )
      await plugin.setSettings({
        ...settings,
        pluginConnectors: {
          connectors: [
            ...settings.pluginConnectors.connectors.filter(
              (entry) => entry.id !== approved.id,
            ),
            approved,
          ],
        },
      })
      onClose()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : t('ui.PluginConnectorReviewModal.approvalFailed'),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <label htmlFor="verbex-connector-json">
        {t('ui.PluginConnectorReviewModal.manifestJSON')}
      </label>
      <textarea
        id="verbex-connector-json"
        disabled={busy}
        value={json}
        rows={12}
        style={{ width: '100%' }}
        onChange={(event) => {
          setJson(event.target.value)
          setManifest(null)
        }}
      />
      <button
        disabled={busy}
        onClick={() => {
          void review()
        }}
      >
        {t('ui.PluginConnectorReviewModal.reviewJSON')}
      </button>
      {manifest && (
        <>
          <p>
            {t('ui.PluginConnectorReviewModal.target')}
            {manifest.target.pluginId} v{targetVersion}{' '}
            {t('ui.PluginConnectorReviewModal.connector')} {manifest.id}
          </p>
          <pre>{JSON.stringify(manifest.target.access, null, 2)}</pre>
          {manifest.tools.map((tool) => (
            <details key={tool.name}>
              <summary>
                {tool.name} · {tool.effect} · {tool.method}
              </summary>
              <p>{tool.description}</p>
              <p>
                {t('ui.PluginConnectorReviewModal.agentCalls')}{' '}
                {tool.options.agentCallable && !tool.options.disabled
                  ? t('ui.PluginConnectorReviewModal.allowed')
                  : t('ui.PluginConnectorReviewModal.off')}
              </p>
              <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
              <pre>
                {JSON.stringify(
                  { args: tool.args, result: tool.result },
                  null,
                  2,
                )}
              </pre>
              <p>
                {t('ui.PluginConnectorReviewModal.resultLimit')}
                {tool.result.maxChars.toLocaleString()}
                {t('ui.PluginConnectorReviewModal.charactersTimeout')}{' '}
                {tool.timeoutMs}ms
              </p>
            </details>
          ))}
          <p>
            {t(
              'ui.PluginConnectorReviewModal.approvalSendsThisMethodSReturnValues',
            )}
          </p>
          <p>
            {t('ui.PluginConnectorReviewModal.ifTheSameIDAlreadyExistsReplace')}
          </p>
          <button
            className="mod-cta"
            disabled={busy}
            onClick={() => {
              void approve()
            }}
          >
            {t(
              'ui.PluginConnectorReviewModal.approveAndRegisterReviewedDefinitions',
            )}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} onClick={onClose}>
        {t('ui.PluginConnectorReviewModal.close')}
      </button>
    </div>
  )
}
