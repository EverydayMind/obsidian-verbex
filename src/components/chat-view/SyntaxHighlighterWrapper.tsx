import { memo } from 'react'
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash'
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css'
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript'
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json'
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx'
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown'
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup'
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python'
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript'
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml'
import {
  oneDark,
  oneLight,
} from 'react-syntax-highlighter/dist/esm/styles/prism'

SyntaxHighlighter.registerLanguage('javascript', javascript)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('jsx', jsx)
SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('json', json)
SyntaxHighlighter.registerLanguage('yaml', yaml)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('markup', markup)
SyntaxHighlighter.registerLanguage('css', css)

function SyntaxHighlighterWrapper({
  isDarkMode,
  language,
  hasFilename,
  wrapLines,
  children,
}: {
  isDarkMode: boolean
  language: string | undefined
  hasFilename: boolean
  wrapLines: boolean
  children: string
}) {
  return (
    <SyntaxHighlighter
      language={language}
      style={isDarkMode ? oneDark : oneLight}
      customStyle={{
        borderRadius: hasFilename
          ? '0 0 var(--radius-s) var(--radius-s)'
          : 'var(--radius-s)',
        margin: 0,
        padding: 'var(--size-4-2)',
        fontSize: 'var(--font-ui-small)',
        fontFamily:
          language === 'markdown' ? 'var(--font-interface)' : 'inherit',
      }}
      wrapLines={wrapLines}
      lineProps={
        // Wrapping should work without lineProps, but Obsidian's default CSS seems to override SyntaxHighlighter's styles.
        // We manually override the white-space property to ensure proper wrapping.
        wrapLines
          ? {
              style: { whiteSpace: 'pre-wrap' },
            }
          : undefined
      }
    >
      {children}
    </SyntaxHighlighter>
  )
}

export const MemoizedSyntaxHighlighterWrapper = memo(SyntaxHighlighterWrapper)
