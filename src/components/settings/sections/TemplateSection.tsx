import { Edit, Trash2 } from 'lucide-react'
import { App, Notice } from 'obsidian'
import { useCallback, useEffect, useState } from 'react'

import { TemplateMetadata } from '../../../database/json/template/types'
import { t } from '../../../i18n'
import VerbexPlugin from '../../../main'
import { ObsidianButton } from '../../common/ObsidianButton'
import { ConfirmModal } from '../../modals/ConfirmModal'
import {
  CreateTemplateModal,
  EditTemplateModal,
} from '../../modals/TemplateFormModal'

type TemplateSectionProps = {
  app: App
  plugin: VerbexPlugin
}

export function TemplateSection({ app, plugin }: TemplateSectionProps) {
  const templateManager = plugin.jsonStorage.templateManager

  const [templateList, setTemplateList] = useState<TemplateMetadata[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchTemplateList = useCallback(async () => {
    setIsLoading(true)
    try {
      setTemplateList(await templateManager.listMetadata())
    } catch (error) {
      console.error('Failed to fetch template list:', error)
      new Notice(t('settings.templates.errors.loadFailed'))
      setTemplateList([])
    } finally {
      setIsLoading(false)
    }
  }, [templateManager])

  const handleCreate = useCallback(() => {
    new CreateTemplateModal({
      app,
      selectedSerializedNodes: null,
      templateManager,
      onSubmit: () => void fetchTemplateList(),
    }).open()
  }, [fetchTemplateList, app])

  const handleEdit = useCallback(
    (template: TemplateMetadata) => {
      new EditTemplateModal({
        app,
        templateId: template.id,
        templateManager,
        onSubmit: () => void fetchTemplateList(),
      }).open()
    },
    [fetchTemplateList, app],
  )

  const handleDelete = useCallback(
    (template: TemplateMetadata) => {
      const message = t('settings.templates.deleteConfirm.message', {
        name: template.name,
      })
      new ConfirmModal(app, {
        title: t('settings.templates.deleteConfirm.title'),
        message: message,
        ctaText: t('settings.common.delete'),
        onConfirm: () => {
          void (async () => {
            try {
              await templateManager.deleteTemplate(template.id)
              void fetchTemplateList()
            } catch (error) {
              console.error('Failed to delete template:', error)
              new Notice(t('settings.templates.errors.deleteFailed'))
            }
          })()
        },
      }).open()
    },
    [templateManager, fetchTemplateList, app],
  )

  useEffect(() => {
    void fetchTemplateList()
  }, [fetchTemplateList])

  return (
    <div className="verbex-settings-section">
      <div className="verbex-settings-header">
        {t('settings.templates.title')}
      </div>

      <div
        className="verbex-settings-desc verbex-settings-callout"
        dangerouslySetInnerHTML={{ __html: t('settings.templates.howToUse') }}
      />

      <div className="verbex-settings-sub-header-container">
        <div className="verbex-settings-sub-header">
          {t('settings.templates.savedTemplates')}
        </div>
        <ObsidianButton
          text={t('settings.templates.addButton')}
          onClick={handleCreate}
        />
      </div>

      <div className="verbex-templates-container">
        <div className="verbex-templates-header">
          <div>{t('settings.templates.table.name')}</div>
          <div>{t('settings.templates.table.actions')}</div>
        </div>
        {isLoading ? (
          <div className="verbex-templates-empty">
            {t('settings.templates.loading')}
          </div>
        ) : templateList.length > 0 ? (
          templateList.map((template) => (
            <TemplateItem
              key={template.id}
              template={template}
              onDelete={() => {
                handleDelete(template)
              }}
              onEdit={() => {
                handleEdit(template)
              }}
            />
          ))
        ) : (
          <div className="verbex-templates-empty">
            {t('settings.templates.empty')}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateItem({
  template,
  onEdit,
  onDelete,
}: {
  template: TemplateMetadata
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="verbex-template">
      <div className="verbex-template-row">
        <div className="verbex-template-name">{template.name}</div>
        <div className="verbex-template-actions">
          <button
            className="clickable-icon"
            aria-label={t('settings.templates.actionsAria.edit')}
            onClick={onEdit}
          >
            <Edit size={16} />
          </button>
          <button
            className="clickable-icon"
            aria-label={t('settings.templates.actionsAria.delete')}
            onClick={onDelete}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
