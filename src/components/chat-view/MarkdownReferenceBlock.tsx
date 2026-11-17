import clsx from 'clsx'
import { Eye } from 'lucide-react'
import { PropsWithChildren, useEffect, useMemo, useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { useDarkModeContext } from '../../contexts/dark-mode-context'
import { SourceTextReader } from '../../core/rag/sourceTextReader'
import { t } from '../../i18n'
import { openMarkdownFile } from '../../utils/obsidian'

import { ObsidianMarkdown } from './ObsidianMarkdown'
import { MemoizedSyntaxHighlighterWrapper } from './SyntaxHighlighterWrapper'

export default function MarkdownReferenceBlock({
  filename,
  startLine,
  endLine,
  language,
}: PropsWithChildren<{
  filename: string
  startLine: number
  endLine: number
  language?: string
}>) {
  const app = useApp()
  const { isDarkMode } = useDarkModeContext()

  const [isPreviewMode, setIsPreviewMode] = useState(true)
  const [blockContent, setBlockContent] = useState<string | null>(null)

  const wrapLines = useMemo(() => {
    return !language || ['markdown'].includes(language)
  }, [language])

  useEffect(() => {
    let cancelled = false
    async function fetchBlockContent() {
      const file = app.vault.getFileByPath(filename)
      if (!file) {
        setBlockContent(null)
        return
      }
      const fileContent =
        (await new SourceTextReader(app).read(filename))?.text ?? ''
      const content = fileContent
        .split('\n')
        .slice(startLine - 1, endLine)
        .join('\n')
      if (!cancelled) setBlockContent(content)
    }

    void fetchBlockContent().catch(() => {
      if (!cancelled) setBlockContent(null)
    })
    return () => {
      cancelled = true
    }
  }, [filename, startLine, endLine, app])

  const handleOpenFile = () => {
    openMarkdownFile(app, filename, startLine)
  }

  return (
    blockContent && (
      <div className={clsx('verbex-code-block', filename && 'has-filename')}>
        <div className="verbex-code-block-header">
          {filename && (
            <div
              className="verbex-code-block-header-filename"
              onClick={handleOpenFile}
            >
              {filename}
            </div>
          )}
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
          </div>
        </div>
        {isPreviewMode ? (
          <div className="verbex-code-block-obsidian-markdown">
            <ObsidianMarkdown content={blockContent} scale="sm" />
          </div>
        ) : (
          <MemoizedSyntaxHighlighterWrapper
            isDarkMode={isDarkMode}
            language={language}
            hasFilename={!!filename}
            wrapLines={wrapLines}
          >
            {blockContent}
          </MemoizedSyntaxHighlighterWrapper>
        )}
      </div>
    )
  )
}
