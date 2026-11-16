import { randomUUID } from 'crypto'

import { App, Notice } from 'obsidian'
import { useEffect, useRef, useState } from 'react'
import TextareaAutosize from 'react-textarea-autosize'

import { readMcpSecret, resolveMcpToken } from '../../../core/mcp/credentials'
import { mcpEnvironment } from '../../../core/mcp/environment'
import { validateMcpUrl } from '../../../core/mcp/httpFetch'
import { openMcpConnection } from '../../../core/mcp/mcpConnection'
import { isOAuth } from '../../../core/mcp/oauthStore'
import { validateServerName } from '../../../core/mcp/tool-name-utils'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import {
  McpServerParameters,
  mcpServerParametersSchema,
} from '../../../types/mcp.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'
import { ReactModal } from '../../common/ReactModal'

import {
  McpConnectionFieldValues,
  McpConnectionFields,
} from './McpConnectionFields'
import { McpOAuthControls } from './McpOAuthControls'

type McpServerFormComponentProps = {
  plugin: VerbexPlugin
  onClose: () => void
  serverId?: string
}
export class AddMcpServerModal extends ReactModal<McpServerFormComponentProps> {
  constructor(app: App, plugin: VerbexPlugin) {
    super({
      app,
      Component: McpServerFormComponent,
      props: { plugin },
      options: { title: t('settings.mcp.addButton') },
    })
  }
}
export class EditMcpServerModal extends ReactModal<McpServerFormComponentProps> {
  constructor(app: App, plugin: VerbexPlugin, serverId: string) {
    super({
      app,
      Component: McpServerFormComponent,
      props: { plugin, serverId },
      options: { title: t('settings.mcp.editModal') },
    })
  }
}

function McpServerFormComponent({
  plugin,
  onClose,
  serverId,
}: McpServerFormComponentProps) {
  const existing = plugin.settings.mcp.servers.find(
    (server) => server.id === serverId,
  )
  const original = existing?.parameters
  const local = original?.transport !== 'http' ? original : undefined
  const remote = original?.transport === 'http' ? original : undefined
  const [name, setName] = useState(existing?.id ?? '')
  const [transport, setTransport] = useState(local ? 'stdio' : 'http')
  const [url, setUrl] = useState(remote?.url ?? '')
  const [auth, setAuth] = useState(remote?.auth.type ?? 'oauth')
  const [secretName, setSecretName] = useState(
    remote && remote.auth.type !== 'none'
      ? remote.auth.secretName
      : `verbex-mcp-oauth-${randomUUID()}`,
  )
  const [command, setCommand] = useState(local?.command ?? '')
  const [args, setArgs] = useState(local?.args?.join('\n') ?? '')
  const [env, setEnv] = useState(JSON.stringify(local?.env ?? {}, null, 2))
  const [json, setJson] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState('')
  const active = useRef(true)
  const revision = useRef(0)
  useEffect(
    () => () => {
      active.current = false
    },
    [],
  )
  useEffect(() => {
    revision.current++
    setResult('')
  }, [transport, url, auth, secretName, command, args, env])

  const parameters = (): McpServerParameters => {
    const value =
      transport === 'http'
        ? {
            transport: 'http',
            url: validateMcpUrl(url.trim()).href,
            auth:
              auth !== 'none' ? { type: auth, secretName } : { type: 'none' },
          }
        : {
            transport: 'stdio',
            command: command.trim(),
            args:
              args === local?.args?.join('\n')
                ? local.args
                : args.split('\n').filter(Boolean),
            env: JSON.parse(env) as unknown,
          }
    const parsed = mcpServerParametersSchema.parse(value)
    if (parsed.transport !== 'http' && !parsed.command)
      throw new Error(t('ui.McpServerFormModal.enterAnExecutableCommand'))
    if (!isOAuth(parsed))
      resolveMcpToken(parsed, (key) => readMcpSecret(plugin.app, key))
    return parsed
  }
  const check = async () => {
    setChecking(true)
    setResult('')
    const checkedRevision = revision.current
    try {
      await plugin.mcpOAuth.prepare(parameters())
      const connection = await openMcpConnection(
        parameters(),
        mcpEnvironment(),
        (key) => readMcpSecret(plugin.app, key),
      )
      await connection.client.close()
      if (active.current && checkedRevision === revision.current)
        setResult(
          t(
            'ui.McpServerFormModal.connectionVerifiedServerToolsToolExecutionRequires',
            { p0: connection.tools.length },
          ),
        )
    } catch (error) {
      if (active.current && checkedRevision === revision.current)
        setResult(
          error instanceof Error
            ? error.message
            : t('ui.McpServerFormModal.couldNotVerifyTheConnection'),
        )
    } finally {
      if (active.current) setChecking(false)
    }
  }
  const save = async () => {
    try {
      const id =
        name.trim() ||
        (transport === 'http'
          ? new URL(url).hostname.replace(/[^a-zA-Z0-9_-]/g, '_')
          : '')
      validateServerName(id)
      if (
        plugin.settings.mcp.servers.some(
          (server) => server.id === id && server.id !== existing?.id,
        )
      )
        throw new Error(t('settings.mcp.form.errors.alreadyExists'))
      const config = {
        ...(existing ?? { enabled: true, toolOptions: {} }),
        id,
        parameters: parameters(),
      }
      await plugin.setSettings({
        ...plugin.settings,
        mcp: {
          ...plugin.settings.mcp,
          servers: existing
            ? plugin.settings.mcp.servers.map((server) =>
                server.id === existing.id ? config : server,
              )
            : [...plugin.settings.mcp.servers, config],
        },
      })
      onClose()
    } catch (error) {
      new Notice(
        error instanceof Error
          ? error.message
          : t('ui.McpServerFormModal.couldNotSaveMCPSettings'),
      )
    }
  }
  const importJson = () => {
    try {
      const parsed = mcpServerParametersSchema.parse(JSON.parse(json))
      if (parsed.transport === 'http') {
        setTransport('http')
        setUrl(parsed.url)
        setAuth(parsed.auth.type)
        setSecretName(parsed.auth.type !== 'none' ? parsed.auth.secretName : '')
      } else {
        setTransport('stdio')
        setCommand(parsed.command)
        setArgs(parsed.args?.join('\n') ?? '')
        setEnv(JSON.stringify(parsed.env ?? {}, null, 2))
      }
      setJson('')
    } catch (error) {
      new Notice(
        error instanceof Error
          ? error.message
          : t('ui.McpServerFormModal.invalidJSONSettings'),
      )
    }
  }
  return (
    <>
      <ObsidianSetting
        name={t('ui.McpServerFormModal.displayName')}
        desc={t('ui.McpServerFormModal.forRemoteConnectionsDefaultsToTheURL')}
      >
        <ObsidianTextInput value={name} onChange={setName} />
      </ObsidianSetting>
      <McpConnectionFields
        app={plugin.app}
        value={{ transport, url, auth, secretName, command, args, env }}
        onChange={(key, value) => {
          const setters: Record<
            keyof McpConnectionFieldValues,
            (value: string) => void
          > = {
            transport: setTransport,
            url: (value) => {
              setUrl(value)
              if (auth === 'oauth' && value !== url)
                setSecretName(`verbex-mcp-oauth-${randomUUID()}`)
            },
            secretName: setSecretName,
            command: setCommand,
            args: setArgs,
            env: setEnv,
            auth: (value) => {
              setAuth(value as 'none' | 'bearer' | 'oauth')
              if (
                value === 'oauth' &&
                !secretName.startsWith('verbex-mcp-oauth-')
              )
                setSecretName(`verbex-mcp-oauth-${randomUUID()}`)
            },
          }
          setters[key](value)
        }}
      />
      {transport === 'http' && auth === 'oauth' && (
        <McpOAuthControls
          plugin={plugin}
          parameters={parameters}
          configurationKey={`${url}:${secretName}:${auth}`}
          serverId={serverId}
        />
      )}
      <details>
        <summary>
          {t('ui.McpServerFormModal.importConnectionSettingsJSONAdvanced')}
        </summary>
        <p>
          {t(
            'ui.McpServerFormModal.importConnectionSettingsUseKeychainEntryNames',
          )}
        </p>
        <TextareaAutosize
          value={json}
          onChange={(event) => setJson(event.target.value)}
          minRows={2}
          maxRows={12}
          className="verbex-mcp-server-modal-textarea"
        />
        <button type="button" onClick={importJson}>
          {t('ui.McpServerFormModal.import')}
        </button>
      </details>
      {result && <p role="status">{result}</p>}
      <ObsidianSetting>
        <ObsidianButton
          text={
            checking
              ? t('ui.McpServerFormModal.checkingConnection')
              : t('ui.McpServerFormModal.testConnection')
          }
          onClick={() => void check()}
          disabled={checking}
        />
        <ObsidianButton
          text={t('settings.common.save')}
          onClick={() => void save()}
          disabled={checking}
          cta
        />
        <ObsidianButton text={t('settings.common.cancel')} onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}
