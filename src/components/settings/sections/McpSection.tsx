import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleMinus,
  Edit,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useState } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import { McpManager } from '../../../core/mcp/mcpManager'
import { getToolName } from '../../../core/mcp/tool-name-utils'
import { mcpNameSupported } from '../../../core/mcp/toolCatalog'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import {
  McpServerState,
  McpServerStatus,
  McpTool,
} from '../../../types/mcp.types'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ObsidianToggle } from '../../common/ObsidianToggle'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  AddMcpServerModal,
  EditMcpServerModal,
} from '../modals/McpServerFormModal'

type McpSectionProps = {
  app: App
  plugin: VerbexPlugin
  searchQuery?: string
}

export function McpSection({ app, plugin, searchQuery = '' }: McpSectionProps) {
  const [mcpManager, setMcpManager] = useState<McpManager | null>(null)
  const [mcpServers, setMcpServers] = useState<McpServerState[]>([])
  const query = searchQuery.toLowerCase()
  const filteredServers = mcpServers.filter(
    (server) =>
      server.name.toLowerCase().includes(query) ||
      (server.status === McpServerStatus.Connected &&
        server.tools.some((tool) =>
          `${tool.name} ${tool.description ?? ''}`
            .toLowerCase()
            .includes(query),
        )),
  )

  useEffect(() => {
    const initMCPManager = async () => {
      const mcpManager = await plugin.getMcpManager()
      setMcpManager(mcpManager)
      setMcpServers(mcpManager.getServers())
    }
    void initMCPManager()
  }, [plugin])

  useEffect(() => {
    if (mcpManager) {
      const unsubscribe = mcpManager.subscribeServersChange((servers) => {
        setMcpServers(servers)
      })
      return () => {
        unsubscribe()
      }
    }
  }, [mcpManager])

  return (
    <div className="verbex-settings-section">
      <div className="verbex-settings-header">{t('settings.mcp.title')}</div>
      <p>{t('ui.McpSection.afterConnectingPinToolsInChatOr')}</p>

      <div className="verbex-settings-desc verbex-settings-callout">
        {t('settings.mcp.warningCallout')}
      </div>

      {mcpManager?.disabled ? (
        <div className="verbex-settings-sub-header-container">
          <div className="verbex-settings-sub-header">
            {t('settings.mcp.mobileNotSupported')}
          </div>
        </div>
      ) : (
        <>
          <div className="verbex-settings-sub-header-container">
            <div className="verbex-settings-sub-header">
              {t('settings.mcp.serversTitle')}
            </div>
            <ObsidianButton
              text={t('settings.mcp.addButton')}
              onClick={() => new AddMcpServerModal(app, plugin).open()}
            />
          </div>

          <div className="verbex-mcp-servers-container">
            <div className="verbex-mcp-servers-header">
              <div>{t('settings.mcp.table.server')}</div>
              <div>{t('settings.mcp.table.status')}</div>
              <div>{t('settings.mcp.table.enabled')}</div>
              <div>{t('settings.mcp.table.actions')}</div>
            </div>
            {filteredServers.length > 0 ? (
              filteredServers.map((server) => (
                <McpServerComponent
                  key={server.name}
                  server={server}
                  app={app}
                  plugin={plugin}
                />
              ))
            ) : (
              <div className="verbex-mcp-servers-empty">
                {t('settings.mcp.empty')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function McpServerComponent({
  server,
  app,
  plugin,
}: {
  server: McpServerState
  app: App
  plugin: VerbexPlugin
}) {
  const { settings, setSettings } = useSettings()
  const [isOpen, setIsOpen] = useState(false)

  const handleEdit = useCallback(() => {
    new EditMcpServerModal(app, plugin, server.name).open()
  }, [server.name, app, plugin])

  const handleDelete = useCallback(() => {
    const message = t('settings.mcp.deleteConfirm.message', {
      name: server.name,
    })
    new ConfirmModal(app, {
      title: t('settings.mcp.deleteConfirm.title'),
      message: message,
      ctaText: t('settings.common.delete'),
      onConfirm: () => {
        void (async () => {
          await setSettings({
            ...settings,
            mcp: {
              ...settings.mcp,
              servers: settings.mcp.servers.filter((s) => s.id !== server.name),
            },
          })
        })()
      },
    }).open()
  }, [server.name, settings, setSettings, app])

  const handleToggleEnabled = useCallback(
    (enabled: boolean) => {
      void setSettings({
        ...settings,
        mcp: {
          ...settings.mcp,
          servers: settings.mcp.servers.map((s) =>
            s.id === server.name ? { ...s, enabled } : s,
          ),
        },
      })
    },
    [settings, setSettings, server.name],
  )

  return (
    <div className="verbex-mcp-server">
      <div className="verbex-mcp-server-row">
        <div className="verbex-mcp-server-name">{server.name}</div>
        <div className="verbex-mcp-server-status">
          <McpServerStatusBadge status={server.status} />
        </div>
        <div className="verbex-mcp-server-toggle">
          <ObsidianToggle
            value={server.config.enabled}
            onChange={handleToggleEnabled}
          />
        </div>
        <div className="verbex-mcp-server-actions">
          <button
            onClick={() => {
              void plugin
                .getMcpManager()
                .then((manager) => manager.reconnectServer(server.name))
            }}
            disabled={
              server.status === McpServerStatus.Connecting ||
              !server.config.enabled
            }
            aria-label={t('ui.McpSection.reconnectMCP')}
          >
            {t('ui.McpSection.reconnect')}
          </button>
          <button
            onClick={handleEdit}
            className="clickable-icon"
            aria-label={t('settings.mcp.actionsAria.edit')}
          >
            <Edit size={16} />
          </button>
          <button
            onClick={handleDelete}
            className="clickable-icon"
            aria-label={t('settings.mcp.actionsAria.delete')}
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="clickable-icon"
            aria-label={
              isOpen ? t('ui.McpSection.collapse') : t('ui.McpSection.expand')
            }
          >
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>
      {isOpen && <ExpandedServerInfo server={server} plugin={plugin} />}
    </div>
  )
}

function ExpandedServerInfo({
  server,
  plugin,
}: {
  server: McpServerState
  plugin: VerbexPlugin
}) {
  if (
    server.status === McpServerStatus.Disconnected ||
    server.status === McpServerStatus.Connecting
  ) {
    return null
  }

  return (
    <div className="verbex-server-expanded-info">
      {server.status === McpServerStatus.Connected && (
        <div>
          <div className="verbex-server-expanded-info-header">
            {t('settings.mcp.expanded.tools')}
          </div>
          <div className="verbex-server-tools-container">
            {server.tools.map((tool) => (
              <McpToolComponent
                key={tool.name}
                tool={tool}
                server={server}
                plugin={plugin}
              />
            ))}
          </div>
        </div>
      )}
      {server.status === McpServerStatus.Error && (
        <div>
          <div className="verbex-server-expanded-info-header">
            {t('settings.mcp.expanded.error')}
          </div>
          <div className="verbex-server-error-message">
            {server.error.message}
          </div>
        </div>
      )}
    </div>
  )
}

function McpServerStatusBadge({ status }: { status: McpServerStatus }) {
  const statusConfig = {
    [McpServerStatus.Connected]: {
      icon: <Check size={16} />,
      label: t('settings.mcp.status.connected'),
      statusClass: 'verbex-mcp-server-status-badge--connected',
    },
    [McpServerStatus.Connecting]: {
      icon: <Loader2 size={16} className="spinner" />,
      label: t('settings.mcp.status.connecting'),
      statusClass: 'verbex-mcp-server-status-badge--connecting',
    },
    [McpServerStatus.Error]: {
      icon: <X size={16} />,
      label: t('settings.mcp.status.error'),
      statusClass: 'verbex-mcp-server-status-badge--error',
    },
    [McpServerStatus.Disconnected]: {
      icon: <CircleMinus size={14} />,
      label: t('settings.mcp.status.disconnected'),
      statusClass: 'verbex-mcp-server-status-badge--disconnected',
    },
  }

  const { icon, label, statusClass } = statusConfig[status]

  return (
    <div className={`verbex-mcp-server-status-badge ${statusClass}`}>
      {icon}
      <div className="verbex-mcp-server-status-badge-label">{label}</div>
    </div>
  )
}

function McpToolComponent({
  tool,
  server,
  plugin,
}: {
  tool: McpTool
  server: McpServerState
  plugin: VerbexPlugin
}) {
  const { settings, setSettings } = useSettings()

  const toolOption = server.config.toolOptions[tool.name]
  const disabled = toolOption?.disabled ?? false
  const allowAutoExecution = toolOption?.allowAutoExecution ?? false
  const name = getToolName(server.name, tool.name)
  const [automatic, setAutomatic] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    void plugin
      .getMcpManager()
      .then(async (manager) => {
        const identity = await manager.getToolIdentity(name)
        if (active)
          setAutomatic(
            Boolean(
              identity && manager.automaticApprovalMatches(name, identity),
            ),
          )
      })
      .catch(() => {
        if (active) setAutomatic(false)
      })
    return () => {
      active = false
    }
  }, [plugin, name, server])

  const handleToggleEnabled = (enabled: boolean) => {
    const toolOptions = {
      ...server.config.toolOptions,
      [tool.name]: { ...toolOption, disabled: !enabled },
    }
    void setSettings({
      ...settings,
      mcp: {
        ...settings.mcp,
        servers: settings.mcp.servers.map((s) =>
          s.id === server.name
            ? {
                ...s,
                toolOptions: toolOptions,
              }
            : s,
        ),
      },
    })
  }

  return (
    <div className="verbex-mcp-tool">
      <div className="verbex-mcp-tool-info">
        <div className="verbex-mcp-tool-name">{tool.name}</div>
        <div className="verbex-mcp-tool-description">{tool.description}</div>
      </div>
      <div className="verbex-mcp-tool-toggle">
        <span className="verbex-mcp-tool-toggle-label">
          {t('settings.mcp.tool.enabled')}
        </span>
        <ObsidianToggle
          value={!disabled}
          onChange={(value) => handleToggleEnabled(value)}
        />
      </div>
      <div className="verbex-mcp-tool-toggle">
        <span className="verbex-mcp-tool-toggle-label">
          {t('settings.mcp.tool.autoExecute')}
        </span>
        <input
          type="checkbox"
          aria-label={t('ui.McpSection.automaticExecution', { p0: tool.name })}
          checked={automatic}
          disabled={saving || disabled || !mcpNameSupported(name)}
          onChange={(event) => {
            const enabled = event.target.checked
            setSaving(true)
            void plugin.mcpToolAdapter
              .setAutomatic(name, enabled)
              .then((changed) => {
                if (changed) setAutomatic(enabled)
              })
              .catch(
                (error) =>
                  new Notice(
                    error instanceof Error
                      ? error.message
                      : t('ui.McpSection.couldNotUpdateMCPAutomaticApproval'),
                  ),
              )
              .finally(() => setSaving(false))
          }}
        />
        {allowAutoExecution && !automatic && (
          <span>{t('ui.McpSection.reviewTargetAndApproveAgain')}</span>
        )}
      </div>
    </div>
  )
}
