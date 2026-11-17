import { $generateNodesFromSerializedNodes } from '@lexical/clipboard'
import { BaseSerializedNode } from '@lexical/clipboard/clipboard'
import { InitialEditorStateType } from '@lexical/react/LexicalComposer'
import { $insertNodes, LexicalEditor } from 'lexical'
import { App, Notice } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import { AppProvider } from '../../contexts/app-context'
import { DuplicateTemplateException } from '../../database/json/exception'
import { TemplateManager } from '../../database/json/template/TemplateManager'
import { t } from '../../i18n'
import LexicalContentEditable from '../chat-view/chat-input/LexicalContentEditable'
import { ObsidianButton } from '../common/ObsidianButton'
import { ObsidianSetting } from '../common/ObsidianSetting'
import { ObsidianTextInput } from '../common/ObsidianTextInput'
import { ReactModal } from '../common/ReactModal'

type TemplateFormComponentProps = {
  app: App
  selectedSerializedNodes?: BaseSerializedNode[] | null
  templateId?: string
  onSubmit?: () => void
  onClose: () => void
  templateManager: TemplateManager
}

export class CreateTemplateModal extends ReactModal<TemplateFormComponentProps> {
  constructor({
    app,
    selectedSerializedNodes,
    onSubmit,
    templateManager,
  }: {
    app: App
    selectedSerializedNodes?: BaseSerializedNode[] | null
    onSubmit?: () => void
    templateManager: TemplateManager
  }) {
    super({
      app: app,
      Component: TemplateFormComponentWrapper,
      props: {
        app,
        selectedSerializedNodes,
        onSubmit,
        templateManager,
      },
      options: {
        title: t('ui.TemplateFormModal.addTitle'),
      },
    })
  }
}

export class EditTemplateModal extends ReactModal<TemplateFormComponentProps> {
  constructor({
    app,
    templateId,
    onSubmit,
    templateManager,
  }: {
    app: App
    templateId?: string
    onSubmit?: () => void
    templateManager: TemplateManager
  }) {
    super({
      app: app,
      Component: TemplateFormComponentWrapper,
      props: {
        app,
        templateId,
        onSubmit,
        templateManager,
      },
      options: {
        title: t('ui.TemplateFormModal.editTitle'),
      },
    })
  }
}

function TemplateFormComponentWrapper({
  app,
  selectedSerializedNodes,
  templateId,
  onSubmit,
  onClose,
  templateManager,
}: TemplateFormComponentProps) {
  return (
    <AppProvider app={app}>
      <TemplateFormComponent
        app={app}
        selectedSerializedNodes={selectedSerializedNodes}
        templateId={templateId}
        onSubmit={onSubmit}
        onClose={onClose}
        templateManager={templateManager}
      />
    </AppProvider>
  )
}

function TemplateFormComponent({
  selectedSerializedNodes,
  templateId,
  onSubmit,
  onClose,
  templateManager,
}: TemplateFormComponentProps) {
  const [templateName, setTemplateName] = useState('')
  const editorRef = useRef<LexicalEditor | null>(null)
  const contentEditableRef = useRef<HTMLDivElement>(null)

  const initialEditorState: InitialEditorStateType = (
    editor: LexicalEditor,
  ) => {
    if (!selectedSerializedNodes) return
    editor.update(() => {
      const parsedNodes = $generateNodesFromSerializedNodes(
        selectedSerializedNodes,
      )
      $insertNodes(parsedNodes)
    })
  }

  const handleSubmit = async () => {
    try {
      if (!editorRef.current) return
      const serializedEditorState = editorRef.current.toJSON()
      const nodes = serializedEditorState.editorState.root.children
      if (nodes.length === 0) {
        new Notice(t('ui.TemplateFormModal.enterContent'))
        return
      }
      if (templateName.trim().length === 0) {
        new Notice(t('ui.TemplateFormModal.enterName'))
        return
      }

      if (templateId === undefined) {
        await templateManager.createTemplate({
          name: templateName,
          content: { nodes },
        })
      } else {
        await templateManager.updateTemplate(templateId, {
          name: templateName,
          content: { nodes },
        })
      }

      new Notice(
        t(
          templateId === undefined
            ? 'ui.TemplateFormModal.created'
            : 'ui.TemplateFormModal.updated',
          { p0: templateName },
        ),
      )

      onSubmit?.()
      onClose()
    } catch (error) {
      if (error instanceof DuplicateTemplateException) {
        new Notice(t('ui.TemplateFormModal.duplicate'))
      } else {
        console.error(error)
        new Notice(t('ui.TemplateFormModal.createFailed'))
      }
    }
  }

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    async function fetchExistingTemplate(templateId: string) {
      try {
        const existingTemplate = await templateManager.findById(templateId)
        if (existingTemplate && isMountedRef.current) {
          setTemplateName(existingTemplate.name)
          editorRef.current?.update(() => {
            const parsedNodes = $generateNodesFromSerializedNodes(
              existingTemplate.content.nodes,
            )
            $insertNodes(parsedNodes)
          })
        }
      } catch (error) {
        console.error('Failed to fetch existing template:', error)
        new Notice(t('ui.TemplateFormModal.loadFailed'))
      }
    }
    if (templateId) {
      void fetchExistingTemplate(templateId)
    }

    return () => {
      isMountedRef.current = false
    }
  }, [templateId, templateManager])

  return (
    <>
      <ObsidianSetting
        name={t('ui.TemplateFormModal.name')}
        desc={t('ui.TemplateFormModal.nameDesc')}
        required
      >
        <ObsidianTextInput
          value={templateName}
          onChange={(value) => setTemplateName(value)}
        />
      </ObsidianSetting>

      <ObsidianSetting
        name={t('ui.TemplateFormModal.content')}
        desc={t('ui.TemplateFormModal.contentDesc')}
        className="verbex-settings-description-preserve-whitespace"
        required
      />
      <div className="verbex-chat-user-input-container">
        <LexicalContentEditable
          initialEditorState={initialEditorState}
          editorRef={editorRef}
          contentEditableRef={contentEditableRef}
          onEnter={() => {
            void handleSubmit()
          }}
        />
      </div>

      <ObsidianSetting>
        <ObsidianButton
          text={t('settings.common.save')}
          onClick={(...args) => {
            void handleSubmit(...args)
          }}
          cta
        />
        <ObsidianButton text={t('settings.common.cancel')} onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}
