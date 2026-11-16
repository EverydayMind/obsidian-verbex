import clsx from 'clsx'
import { Eye, EyeOff, X } from 'lucide-react'
import { PropsWithChildren, useCallback } from 'react'

import { useSettings } from '../../../contexts/settings-context'
import {
  Mentionable,
  MentionableBlock,
  MentionableCurrentFile,
  MentionableDataviewQuery,
  MentionableFile,
  MentionableFolder,
  MentionableImage,
  MentionableUrl,
  MentionableVault,
} from '../../../types/mentionable'

import { getMentionableIcon } from './utils/get-metionable-icon'

type BadgeCommonProps = {
  onDelete: () => void
  onClick: () => void
  isFocused: boolean
  readOnly?: boolean
}

function BadgeBase({
  children,
  onDelete,
  onClick,
  isFocused,
  readOnly,
}: PropsWithChildren<BadgeCommonProps>) {
  return (
    <div
      className={`verbex-chat-user-input-file-badge ${isFocused ? 'verbex-chat-user-input-file-badge-focused' : ''}`}
      onClick={onClick}
    >
      {children}
      {!readOnly && (
        <div
          className="verbex-chat-user-input-file-badge-delete"
          onClick={(evt) => {
            evt.stopPropagation()
            onDelete()
          }}
        >
          <X size={12} />
        </div>
      )}
    </div>
  )
}

function FileBadge({
  mentionable,
  onDelete,
  onClick,
  isFocused,
  readOnly,
}: BadgeCommonProps & { mentionable: MentionableFile }) {
  const Icon = getMentionableIcon(mentionable)
  return (
    <BadgeBase
      onDelete={onDelete}
      onClick={onClick}
      isFocused={isFocused}
      readOnly={readOnly}
    >
      <div className="verbex-chat-user-input-file-badge-name">
        {Icon && (
          <Icon
            size={12}
            className="verbex-chat-user-input-file-badge-name-icon"
          />
        )}
        <span>{mentionable.file.name}</span>
      </div>
    </BadgeBase>
  )
}

function FolderBadge({
  mentionable,
  onDelete,
  onClick,
  isFocused,
  readOnly,
}: BadgeCommonProps & { mentionable: MentionableFolder }) {
  const Icon = getMentionableIcon(mentionable)
  return (
    <BadgeBase
      onDelete={onDelete}
      onClick={onClick}
      isFocused={isFocused}
      readOnly={readOnly}
    >
      <div className="verbex-chat-user-input-file-badge-name">
        {Icon && (
          <Icon
            size={12}
            className="verbex-chat-user-input-file-badge-name-icon"
          />
        )}
        <span>{mentionable.folder.name}</span>
      </div>
    </BadgeBase>
  )
}

function VaultBadge({
  mentionable,
  onDelete,
  onClick,
  isFocused,
  readOnly,
}: BadgeCommonProps & { mentionable: MentionableVault }) {
  const Icon = getMentionableIcon(mentionable)
  return (
    <BadgeBase
      onDelete={onDelete}
      onClick={onClick}
      isFocused={isFocused}
      readOnly={readOnly}
    >
      <div className="verbex-chat-user-input-file-badge-name">
        {Icon && (
          <Icon
            size={12}
            className="verbex-chat-user-input-file-badge-name-icon"
          />
        )}
        <span>Vault</span>
      </div>
    </BadgeBase>
  )
}

function CurrentFileBadge({
  mentionable,
  onDelete,
  onClick,
  isFocused,
  readOnly,
}: BadgeCommonProps & { mentionable: MentionableCurrentFile }) {
  const { settings, setSettings } = useSettings()

  const handleCurrentFileToggle = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      void setSettings({
        ...settings,
        chatOptions: {
          ...settings.chatOptions,
          includeCurrentFileContent:
            !settings.chatOptions.includeCurrentFileContent,
        },
      })
    },
    [settings, setSettings],
  )

  const Icon = getMentionableIcon(mentionable)
  return mentionable.file ? (
    <BadgeBase
      onDelete={onDelete}
      onClick={onClick}
      isFocused={isFocused}
      readOnly={readOnly}
    >
      <div className="verbex-chat-user-input-file-badge-name">
        {Icon && (
          <Icon
            size={12}
            className="verbex-chat-user-input-file-badge-name-icon"
          />
        )}
        <span
          className={clsx(
            !readOnly &&
              !settings.chatOptions.includeCurrentFileContent &&
              'verbex-excluded-content',
          )}
        >
          {mentionable.file.name}
        </span>
      </div>
      <div
        className={clsx(
          'verbex-chat-user-input-file-badge-name-suffix',
          !readOnly &&
            !settings.chatOptions.includeCurrentFileContent &&
            'verbex-excluded-content',
        )}
      >
        {' (Current File)'}
      </div>
      {!readOnly && (
        <div
          className="verbex-chat-user-input-file-badge-eye"
          onClick={handleCurrentFileToggle}
        >
          {settings.chatOptions.includeCurrentFileContent ? (
            <Eye size={12} />
          ) : (
            <EyeOff size={12} />
          )}
        </div>
      )}
    </BadgeBase>
  ) : null
}

function BlockBadge({
  mentionable,
  onDelete,
  onClick,
  isFocused,
  readOnly,
}: BadgeCommonProps & { mentionable: MentionableBlock }) {
  const Icon = getMentionableIcon(mentionable)
  return (
    <BadgeBase
      onDelete={onDelete}
      onClick={onClick}
      isFocused={isFocused}
      readOnly={readOnly}
    >
      <div className="verbex-chat-user-input-file-badge-name">
        {Icon && (
          <Icon
            size={12}
            className="verbex-chat-user-input-file-badge-name-icon"
          />
        )}
        <span>{mentionable.file.name}</span>
      </div>
      <div className="verbex-chat-user-input-file-badge-name-suffix">
        {` (${mentionable.startLine}:${mentionable.endLine})`}
      </div>
    </BadgeBase>
  )
}

function UrlBadge({
  mentionable,
  onDelete,
  onClick,
  isFocused,
  readOnly,
}: BadgeCommonProps & { mentionable: MentionableUrl }) {
  const Icon = getMentionableIcon(mentionable)
  return (
    <BadgeBase
      onDelete={onDelete}
      onClick={onClick}
      isFocused={isFocused}
      readOnly={readOnly}
    >
      <div className="verbex-chat-user-input-file-badge-name">
        {Icon && (
          <Icon
            size={12}
            className="verbex-chat-user-input-file-badge-name-icon"
          />
        )}
        <span>{mentionable.url}</span>
      </div>
    </BadgeBase>
  )
}

function ImageBadge({
  mentionable,
  onDelete,
  onClick,
  isFocused,
  readOnly,
}: BadgeCommonProps & { mentionable: MentionableImage }) {
  const Icon = getMentionableIcon(mentionable)
  return (
    <BadgeBase
      onDelete={onDelete}
      onClick={onClick}
      isFocused={isFocused}
      readOnly={readOnly}
    >
      <div className="verbex-chat-user-input-file-badge-name">
        {Icon && (
          <Icon
            size={12}
            className="verbex-chat-user-input-file-badge-name-icon"
          />
        )}
        <span>{mentionable.name}</span>
      </div>
    </BadgeBase>
  )
}

function DataviewQueryBadge({
  mentionable,
  onDelete,
  onClick,
  isFocused,
  readOnly,
}: BadgeCommonProps & { mentionable: MentionableDataviewQuery }) {
  const Icon = getMentionableIcon(mentionable)
  const shortQuery =
    mentionable.query.length > 40
      ? mentionable.query.slice(0, 37) + '...'
      : mentionable.query
  return (
    <BadgeBase
      onDelete={onDelete}
      onClick={onClick}
      isFocused={isFocused}
      readOnly={readOnly}
    >
      <div className="verbex-chat-user-input-file-badge-name">
        {Icon && (
          <Icon
            size={12}
            className="verbex-chat-user-input-file-badge-name-icon"
          />
        )}
        <span>{shortQuery}</span>
      </div>
    </BadgeBase>
  )
}

export default function MentionableBadge({
  mentionable,
  onDelete,
  onClick,
  isFocused = false,
  readOnly = false,
}: {
  mentionable: Mentionable
  onDelete: () => void
  onClick: () => void
  isFocused?: boolean
  /** Hides delete/toggle affordances so a past query renders as a closed record. */
  readOnly?: boolean
}) {
  switch (mentionable.type) {
    case 'file':
      return (
        <FileBadge
          mentionable={mentionable}
          onDelete={onDelete}
          onClick={onClick}
          isFocused={isFocused}
          readOnly={readOnly}
        />
      )
    case 'folder':
      return (
        <FolderBadge
          mentionable={mentionable}
          onDelete={onDelete}
          onClick={onClick}
          isFocused={isFocused}
          readOnly={readOnly}
        />
      )
    case 'vault':
      return (
        <VaultBadge
          mentionable={mentionable}
          onDelete={onDelete}
          onClick={onClick}
          isFocused={isFocused}
          readOnly={readOnly}
        />
      )
    case 'current-file':
      return (
        <CurrentFileBadge
          mentionable={mentionable}
          onDelete={onDelete}
          onClick={onClick}
          isFocused={isFocused}
          readOnly={readOnly}
        />
      )
    case 'block':
      return (
        <BlockBadge
          mentionable={mentionable}
          onDelete={onDelete}
          onClick={onClick}
          isFocused={isFocused}
          readOnly={readOnly}
        />
      )
    case 'url':
      return (
        <UrlBadge
          mentionable={mentionable}
          onDelete={onDelete}
          onClick={onClick}
          isFocused={isFocused}
          readOnly={readOnly}
        />
      )
    case 'image':
      return (
        <ImageBadge
          mentionable={mentionable}
          onDelete={onDelete}
          onClick={onClick}
          isFocused={isFocused}
          readOnly={readOnly}
        />
      )
    case 'dataview-query':
      return (
        <DataviewQueryBadge
          mentionable={mentionable}
          onDelete={onDelete}
          onClick={onClick}
          isFocused={isFocused}
          readOnly={readOnly}
        />
      )
  }
}
