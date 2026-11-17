import { useQuery } from '@tanstack/react-query'
import { $nodesOfType, LexicalEditor, SerializedEditorState } from 'lexical'
import {
  ReactNode,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'

import type { ContextMode } from '../../../context/contextPolicy'
import { useApp } from '../../../contexts/app-context'
import { usePlugin } from '../../../contexts/plugin-context'
import { t } from '../../../i18n'
import {
  Mentionable,
  MentionableImage,
  SerializedMentionable,
} from '../../../types/mentionable'
import {
  deserializeMentionable,
  getMentionableKey,
  serializeMentionable,
} from '../../../utils/chat/mentionable'
import { fileToMentionableImage } from '../../../utils/llm/image'
import { openMarkdownFile, readTFileContent } from '../../../utils/obsidian'
import { ObsidianDropdown } from '../../common/ObsidianDropdown'
import { CreateTemplateModal } from '../../modals/TemplateFormModal'
import { ObsidianMarkdown } from '../ObsidianMarkdown'

import { ImageUploadButton } from './ImageUploadButton'
import LexicalContentEditable from './LexicalContentEditable'
import MentionableBadge from './MentionableBadge'
import { ModelSelect } from './ModelSelect'
import { MentionNode } from './plugins/mention/MentionNode'
import { NodeMutations } from './plugins/on-mutation/OnMutationPlugin'
import { SubmitButton } from './SubmitButton'
import ToolBadge from './ToolBadge'

export type ChatUserInputRef = {
  focus: () => void
}

export type ChatUserInputProps = {
  initialSerializedEditorState: SerializedEditorState | null
  onChange: (content: SerializedEditorState) => void
  onSubmit: (content: SerializedEditorState) => void
  onFocus: () => void
  mentionables: Mentionable[]
  setMentionables: (mentionables: Mentionable[]) => void
  autoFocus?: boolean
  addedBlockKey?: string | null
  /**
   * 'live' (default): the current in-progress input, with all controls.
   * 'historical': an already-submitted query being redisplayed/edited in the
   * chat history - hides Tools/Image/Chat handles and shows the
   * model name read-only instead of the model selector.
   */
  pinnedConnectorTools?: string[]
  onPinnedConnectorToolsChange?: (names: string[]) => void
  excludedToolNames?: string[]
  onExcludedToolNamesChange?: (names: string[]) => void
  variant?: 'live' | 'historical'
  /** Rendered in place of the Image/Chat buttons when variant is 'historical'. */
  extraControls?: ReactNode
  /** Model snapshot to show read-only when variant is 'historical'. */
  modelId?: string
  /** One-turn context policy override; Auto delegates to the persistent mode. */
  contextModeOverride?: ContextMode
  onContextModeChange?: (mode: ContextMode | undefined) => void
}

const ChatUserInput = forwardRef<ChatUserInputRef, ChatUserInputProps>(
  (
    {
      initialSerializedEditorState,
      onChange,
      onSubmit,
      onFocus,
      mentionables,
      setMentionables,
      autoFocus = false,
      addedBlockKey,
      variant = 'live',
      pinnedConnectorTools = [],
      onPinnedConnectorToolsChange,
      excludedToolNames = [],
      onExcludedToolNamesChange,
      extraControls,
      modelId,
      contextModeOverride,
      onContextModeChange,
    },
    ref,
  ) => {
    const app = useApp()
    const plugin = usePlugin()

    const editorRef = useRef<LexicalEditor | null>(null)
    const contentEditableRef = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    const [displayedMentionableKey, setDisplayedMentionableKey] = useState<
      string | null
    >(addedBlockKey ?? null)

    useEffect(() => {
      if (addedBlockKey) {
        setDisplayedMentionableKey(addedBlockKey)
      }
    }, [addedBlockKey])

    useImperativeHandle(ref, () => ({
      focus: () => {
        contentEditableRef.current?.focus()
      },
    }))

    const handleMentionNodeMutation = (
      mutations: NodeMutations<MentionNode>,
    ) => {
      const destroyedMentionableKeys: string[] = []
      const addedMentionables: SerializedMentionable[] = []
      mutations.forEach((mutation) => {
        const mentionable = mutation.node.getMentionable()
        const mentionableKey = getMentionableKey(mentionable)

        if (mutation.mutation === 'destroyed') {
          const nodeWithSameMentionable = editorRef.current?.read(() =>
            $nodesOfType(MentionNode).find(
              (node) =>
                getMentionableKey(node.getMentionable()) === mentionableKey,
            ),
          )

          if (!nodeWithSameMentionable) {
            // remove mentionable only if it's not present in the editor state
            destroyedMentionableKeys.push(mentionableKey)
          }
        } else if (mutation.mutation === 'created') {
          if (
            mentionables.some(
              (m) =>
                getMentionableKey(serializeMentionable(m)) === mentionableKey,
            ) ||
            addedMentionables.some(
              (m) => getMentionableKey(m) === mentionableKey,
            )
          ) {
            // do nothing if mentionable is already added
            return
          }

          addedMentionables.push(mentionable)
        }
      })

      setMentionables(
        mentionables
          .filter(
            (m) =>
              !destroyedMentionableKeys.includes(
                getMentionableKey(serializeMentionable(m)),
              ),
          )
          .concat(
            addedMentionables
              .map((m) => deserializeMentionable(m, app))
              .filter((v) => !!v),
          ),
      )
      if (addedMentionables.length > 0) {
        setDisplayedMentionableKey(
          getMentionableKey(addedMentionables[addedMentionables.length - 1]),
        )
      }
    }

    const handleCreateImageMentionables = useCallback(
      (mentionableImages: MentionableImage[]) => {
        const newMentionableImages = mentionableImages.filter(
          (m) =>
            !mentionables.some(
              (mentionable) =>
                getMentionableKey(serializeMentionable(mentionable)) ===
                getMentionableKey(serializeMentionable(m)),
            ),
        )
        if (newMentionableImages.length === 0) return
        setMentionables([...mentionables, ...newMentionableImages])
        setDisplayedMentionableKey(
          getMentionableKey(
            serializeMentionable(
              newMentionableImages[newMentionableImages.length - 1],
            ),
          ),
        )
      },
      [mentionables, setMentionables],
    )

    const handleMentionableDelete = (mentionable: Mentionable) => {
      const mentionableKey = getMentionableKey(
        serializeMentionable(mentionable),
      )
      setMentionables(
        mentionables.filter(
          (m) => getMentionableKey(serializeMentionable(m)) !== mentionableKey,
        ),
      )

      editorRef.current?.update(() => {
        $nodesOfType(MentionNode).forEach((node) => {
          if (getMentionableKey(node.getMentionable()) === mentionableKey) {
            node.remove()
          }
        })
      })
    }

    const handleUploadImages = async (images: File[]) => {
      const mentionableImages = await Promise.all(
        images.map((image) => fileToMentionableImage(image)),
      )
      handleCreateImageMentionables(mentionableImages)
    }

    const handleSubmit = () => {
      const content = editorRef.current?.getEditorState()?.toJSON()
      content && onSubmit(content)
    }

    return (
      <div className="verbex-chat-user-input-container" ref={containerRef}>
        <div className="verbex-chat-user-input-files">
          {variant === 'live' && (
            <>
              <ToolBadge
                selection={{
                  pinned: pinnedConnectorTools,
                  excluded: excludedToolNames,
                }}
                onChange={
                  onPinnedConnectorToolsChange
                    ? (selection) => {
                        onPinnedConnectorToolsChange([
                          ...(selection.pinned ?? []),
                        ])
                        onExcludedToolNamesChange?.([
                          ...(selection.excluded ?? []),
                        ])
                      }
                    : undefined
                }
              />
            </>
          )}
          {mentionables.map((m) => (
            <MentionableBadge
              key={getMentionableKey(serializeMentionable(m))}
              mentionable={m}
              readOnly={variant === 'historical'}
              onDelete={() => handleMentionableDelete(m)}
              onClick={() => {
                const mentionableKey = getMentionableKey(
                  serializeMentionable(m),
                )
                if (
                  (m.type === 'current-file' ||
                    m.type === 'file' ||
                    m.type === 'block') &&
                  m.file &&
                  mentionableKey === displayedMentionableKey
                ) {
                  // open file on click again
                  openMarkdownFile(
                    app,
                    m.file.path,
                    m.type === 'block' ? m.startLine : undefined,
                  )
                } else {
                  setDisplayedMentionableKey(mentionableKey)
                }
              }}
              isFocused={
                getMentionableKey(serializeMentionable(m)) ===
                displayedMentionableKey
              }
            />
          ))}
        </div>

        <MentionableContentPreview
          displayedMentionableKey={displayedMentionableKey}
          mentionables={mentionables}
        />

        <LexicalContentEditable
          initialEditorState={(editor) => {
            if (initialSerializedEditorState) {
              editor.setEditorState(
                editor.parseEditorState(initialSerializedEditorState),
              )
            }
          }}
          editorRef={editorRef}
          contentEditableRef={contentEditableRef}
          onChange={onChange}
          onEnter={handleSubmit}
          onFocus={onFocus}
          onMentionNodeMutation={handleMentionNodeMutation}
          onCreateImageMentionables={
            variant === 'live' ? handleCreateImageMentionables : undefined
          }
          autoFocus={autoFocus}
          plugins={{
            onEnter: {
              onVaultChat: handleSubmit,
            },
            templatePopover: {
              onCreateTemplate: (selectedSerializedNodes) =>
                new CreateTemplateModal({
                  app,
                  selectedSerializedNodes,
                  templateManager: plugin.jsonStorage.templateManager,
                }).open(),
              anchorElement: containerRef.current,
            },
          }}
        />

        <div className="verbex-chat-user-input-controls">
          <div className="verbex-chat-user-input-controls__left">
            <div className="verbex-chat-user-input-controls__model-select-container">
              <ModelSelect
                readOnly={variant === 'historical'}
                modelId={modelId}
              />
            </div>
            {variant === 'live' && onContextModeChange && (
              <div className="verbex-chat-user-input-controls__context-mode">
                <ObsidianDropdown
                  value={contextModeOverride ?? 'auto'}
                  options={{
                    auto: t('ui.ChatUserInput.contextAuto'),
                    full: t('ui.ChatUserInput.contextFull'),
                    catalog: t('ui.ChatUserInput.contextCatalog'),
                    off: t('ui.ChatUserInput.contextOff'),
                  }}
                  onChange={(value) =>
                    onContextModeChange(
                      value === 'auto' ? undefined : (value as ContextMode),
                    )
                  }
                />
              </div>
            )}
          </div>
          <div className="verbex-chat-user-input-controls__buttons">
            {variant === 'live' && (
              <>
                <ImageUploadButton
                  onUpload={(images) => {
                    void handleUploadImages(images)
                  }}
                />
                <SubmitButton onClick={() => handleSubmit()} />
              </>
            )}
            {extraControls}
          </div>
        </div>
      </div>
    )
  },
)

function MentionableContentPreview({
  displayedMentionableKey,
  mentionables,
}: {
  displayedMentionableKey: string | null
  mentionables: Mentionable[]
}) {
  const app = useApp()

  const displayedMentionable: Mentionable | null = useMemo(() => {
    return (
      mentionables.find(
        (m) =>
          getMentionableKey(serializeMentionable(m)) ===
          displayedMentionableKey,
      ) ?? null
    )
  }, [displayedMentionableKey, mentionables])

  const { data: displayFileContent } = useQuery({
    enabled:
      !!displayedMentionable &&
      ['file', 'current-file', 'block'].includes(displayedMentionable.type),
    queryKey: [
      'file',
      displayedMentionableKey,
      mentionables.map((m) => getMentionableKey(serializeMentionable(m))), // should be updated when mentionables change (especially on delete)
    ],
    queryFn: async () => {
      if (!displayedMentionable) return null
      if (
        displayedMentionable.type === 'file' ||
        displayedMentionable.type === 'current-file'
      ) {
        if (!displayedMentionable.file) return null
        return await readTFileContent(displayedMentionable.file, app.vault)
      } else if (displayedMentionable.type === 'block') {
        const fileContent = await readTFileContent(
          displayedMentionable.file,
          app.vault,
        )

        return fileContent
          .split('\n')
          .slice(
            displayedMentionable.startLine - 1,
            displayedMentionable.endLine,
          )
          .join('\n')
      }

      return null
    },
  })

  const displayImage: MentionableImage | null = useMemo(() => {
    return displayedMentionable?.type === 'image' ? displayedMentionable : null
  }, [displayedMentionable])

  return displayFileContent ? (
    <div className="verbex-chat-user-input-file-content-preview">
      <ObsidianMarkdown content={displayFileContent} scale="xs" />
    </div>
  ) : displayImage ? (
    <div className="verbex-chat-user-input-file-content-preview">
      <img src={displayImage.data} alt={displayImage.name} />
    </div>
  ) : null
}

ChatUserInput.displayName = 'ChatUserInput'

export default ChatUserInput
