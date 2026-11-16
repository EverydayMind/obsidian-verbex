import { App, requireApiVersion } from 'obsidian'
import TextareaAutosize from 'react-textarea-autosize'

import { t } from '../../../i18n'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { ObsidianSecretInput } from '../../common/ObsidianSecretInput'
import { ObsidianSetting } from '../../common/ObsidianSetting'
import { ObsidianTextInput } from '../../common/ObsidianTextInput'

export type McpConnectionFieldValues = {
  transport: string
  url: string
  auth: string
  secretName: string
  command: string
  args: string
  env: string
}
export function McpConnectionFields({
  app,
  value,
  onChange,
}: {
  app: App
  value: McpConnectionFieldValues
  onChange: (key: keyof McpConnectionFieldValues, value: string) => void
}) {
  const { transport, url, auth, secretName, command, args, env } = value
  const secretSupported =
    requireApiVersion('1.11.5') && Boolean(app.secretStorage)
  return (
    <>
      <ObsidianSetting name={t('ui.McpConnectionFields.connectionType')}>
        <ObsidianDropdown
          value={transport}
          options={{
            http: t('ui.McpConnectionFields.remoteMCPURL'),
            stdio: t('ui.McpConnectionFields.localProgramAdvanced'),
          }}
          onChange={(v) => onChange('transport', v)}
        />
      </ObsidianSetting>{' '}
      {transport === 'http' ? (
        <>
          <ObsidianSetting
            name="MCP endpoint URL"
            desc={t('ui.McpConnectionFields.enterTheMCPAddressProvidedByThe')}
            required
          >
            <ObsidianTextInput
              value={url}
              onChange={(v) => onChange('url', v)}
              placeholder="https://example.com/mcp"
            />
          </ObsidianSetting>
          <ObsidianSetting name={t('ui.McpConnectionFields.authentication')}>
            <ObsidianDropdown
              value={auth}
              options={{
                oauth: t('ui.McpConnectionFields.browserSignInOAuthDCR'),
                none: t('ui.McpConnectionFields.none'),
                bearer: t('ui.McpConnectionFields.tokenObsidianKeychain'),
              }}
              onChange={(v) => onChange('auth', v)}
            />
          </ObsidianSetting>
          {auth === 'bearer' && (
            <ObsidianSetting
              name={t('ui.McpConnectionFields.keychainSecret')}
              desc={
                secretSupported
                  ? t('ui.McpConnectionFields.chooseAnExistingTokenOrCreateA')
                  : t(
                      'ui.McpConnectionFields.tokenConnectionsRequireSecretStorageInObsidian',
                    )
              }
              required
            >
              {secretSupported && (
                <ObsidianSecretInput
                  app={app}
                  value={secretName}
                  onChange={(v) => onChange('secretName', v)}
                />
              )}
            </ObsidianSetting>
          )}
          {auth === 'oauth' && !secretSupported && (
            <p>
              {t('ui.McpConnectionFields.oAuthSignInRequiresSecretStorageIn')}
            </p>
          )}
        </>
      ) : (
        <>
          <ObsidianSetting
            name={t('ui.McpConnectionFields.command')}
            desc={t(
              'ui.McpConnectionFields.localMCPProgramOrFullExecutablePath',
            )}
            required
          >
            <ObsidianTextInput
              value={command}
              onChange={(v) => onChange('command', v)}
              placeholder="npx"
            />
          </ObsidianSetting>
          <ObsidianSetting
            name={t('ui.McpConnectionFields.arguments')}
            desc={t('ui.McpConnectionFields.enterOneArgumentPerLineDoNot')}
          />
          <TextareaAutosize
            value={args}
            onChange={(event) => onChange('args', event.target.value)}
            minRows={2}
            maxRows={12}
            className="verbex-mcp-server-modal-textarea"
          />
          <details>
            <summary>
              {t('ui.McpConnectionFields.environmentVariablesAdvanced')}
            </summary>
            <p>
              {t('ui.McpConnectionFields.onlySpecifiedValuesAreAddedToThe')}
            </p>
            <TextareaAutosize
              value={env}
              onChange={(event) => onChange('env', event.target.value)}
              minRows={2}
              maxRows={12}
              className="verbex-mcp-server-modal-textarea"
            />
          </details>
        </>
      )}
    </>
  )
}
