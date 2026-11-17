import {
  Check,
  ChevronDown,
  ChevronRight,
  CopyIcon,
  Eye,
  Loader2,
  Play,
} from 'lucide-react'
import { PropsWithChildren, useMemo, useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { useDarkModeContext } from '../../contexts/dark-mode-context'
import { t } from '../../i18n'
import { coerceString } from '../../utils/coerceString'
import { openMarkdownFile } from '../../utils/obsidian'

import { ObsidianMarkdown } from './ObsidianMarkdown'
import { MemoizedSyntaxHighlighterWrapper } from './SyntaxHighlighterWrapper'

export default function MarkdownCodeComponent({
  onApply,
  isApplying,
  language,
  filename,
  title,
  defaultCollapsed = false,
  children,
}: PropsWithChildren<{
  onApply: (blockToApply: string, filename?: string) => void
  isApplying: boolean
  language?: string
  filename?: string
  title?: string
  defaultCollapsed?: boolean
}>) {
  const app = useApp()
  const { isDarkMode } = useDarkModeContext()

  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed)
  const [isPreviewMode, setIsPreviewMode] = useState(true)
  const [copied, setCopied] = useState(false)
  const displayTitle = filename ?? title ?? 'verbex_block'

  const wrapLines = useMemo(() => {
    return !language || ['markdown'].includes(language)
  }, [language])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(coerceString(children))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  const handleOpenFile = () => {
    if (filename) {
      openMarkdownFile(app, filename)
    }
  }

  return (
    <div
      className={`verbex-code-block${isCollapsed ? ' verbex-code-block--collapsed' : ''}`}
    >
      <div className="verbex-code-block-header">
        <button
          className="clickable-icon verbex-code-block-collapse-toggle"
          onClick={() => {
            setIsCollapsed((collapsed) => !collapsed)
          }}
          aria-label={
            isCollapsed
              ? t('ui.MarkdownCodeComponent.expand')
              : t('ui.MarkdownCodeComponent.collapse')
          }
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        {filename ? (
          <div
            className="verbex-code-block-header-filename"
            onClick={handleOpenFile}
            title={filename}
          >
            {displayTitle}
          </div>
        ) : (
          <div className="verbex-code-block-header-title">{displayTitle}</div>
        )}
        {!isCollapsed && (
          <div className="verbex-code-block-header-button-container">
            <button
              className="clickable-icon verbex-code-block-header-button"
              onClick={() => {
                setIsPreviewMode(!isPreviewMode)
              }}
            >
              <Eye size={12} />
              {isPreviewMode
                ? t('ui.MarkdownCodeComponent.viewRaw')
                : t('ui.MarkdownCodeComponent.viewFormatted')}
            </button>
            <button
              className="clickable-icon verbex-code-block-header-button"
              onClick={() => {
                void handleCopy()
              }}
            >
              {copied ? (
                <>
                  <Check size={10} />
                  <span>{t('ui.MarkdownCodeComponent.copied')}</span>
                </>
              ) : (
                <>
                  <CopyIcon size={10} />
                  <span>{t('ui.MarkdownCodeComponent.copy')}</span>
                </>
              )}
            </button>
            <button
              className="clickable-icon verbex-code-block-header-button"
              onClick={
                isApplying
                  ? undefined
                  : () => {
                      onApply(coerceString(children), filename)
                    }
              }
              aria-disabled={isApplying}
            >
              {isApplying ? (
                <>
                  <Loader2 className="spinner" size={14} />
                  <span>{t('ui.MarkdownCodeComponent.applying')}</span>
                </>
              ) : (
                <>
                  <Play size={10} />
                  <span>{t('ui.ToolMessage.apply')}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
      {!isCollapsed &&
        (isPreviewMode ? (
          <div className="verbex-code-block-obsidian-markdown">
            <ObsidianMarkdown content={coerceString(children)} scale="sm" />
          </div>
        ) : (
          <MemoizedSyntaxHighlighterWrapper
            isDarkMode={isDarkMode}
            language={language}
            hasFilename={!!filename}
            wrapLines={wrapLines}
          >
            {coerceString(children)}
          </MemoizedSyntaxHighlighterWrapper>
        ))}
      {!isCollapsed && (
        <div className="verbex-code-block-footer">
          <div className="verbex-code-block-header-button-container">
            <button
              className="clickable-icon verbex-code-block-header-button"
              onClick={() => {
                void handleCopy()
              }}
            >
              {copied ? (
                <>
                  <Check size={10} />
                  <span>{t('ui.MarkdownCodeComponent.copied')}</span>
                </>
              ) : (
                <>
                  <CopyIcon size={10} />
                  <span>{t('ui.MarkdownCodeComponent.copy')}</span>
                </>
              )}
            </button>
            <button
              className="clickable-icon verbex-code-block-header-button"
              onClick={
                isApplying
                  ? undefined
                  : () => {
                      onApply(coerceString(children), filename)
                    }
              }
              aria-disabled={isApplying}
            >
              {isApplying ? (
                <>
                  <Loader2 className="spinner" size={14} />
                  <span>{t('ui.MarkdownCodeComponent.applying')}</span>
                </>
              ) : (
                <>
                  <Play size={10} />
                  <span>{t('ui.ToolMessage.apply')}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
