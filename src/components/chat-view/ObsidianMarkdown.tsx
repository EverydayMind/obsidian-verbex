import { App, Component, Keymap, MarkdownRenderer } from 'obsidian'
import { memo, useEffect, useRef, useState } from 'react'

import { useApp } from '../../contexts/app-context'
import { useChatView } from '../../contexts/chat-view-context'
import {
  getVaultFileMentionIndex,
  linkifyVaultFileMentions,
} from '../../utils/chat/fileMentions'
import {
  openSourceCitation,
  parseCitationLink,
} from '../../utils/sourceCitation'

// The whole message is re-parsed on each render, so following every streamed
// frame costs O(length) sixty times a second. Ten renders a second still reads
// as live text; the latest content is always rendered once the stream pauses.
export const STREAMING_RENDER_INTERVAL_MS = 100

function useStreamingThrottle(content: string): string {
  const [rendered, setRendered] = useState(content)
  const lastRenderAt = useRef(0)
  useEffect(() => {
    if (content === rendered) {
      lastRenderAt.current = Date.now()
      return
    }
    const wait = Math.max(
      0,
      lastRenderAt.current + STREAMING_RENDER_INTERVAL_MS - Date.now(),
    )
    const timer = window.setTimeout(() => setRendered(content), wait)
    return () => window.clearTimeout(timer)
  }, [content, rendered])
  return rendered
}

type ObsidianMarkdownProps = {
  content: string
  scale?: 'xs' | 'sm' | 'base'
  linkifyFileMentions?: boolean
}

/**
 * Renders Obsidian Markdown content using the Obsidian MarkdownRenderer.
 *
 * @param content - The Obsidian Markdown content to render.
 * @param scale - The scale of the markdown content.
 * @returns A React component that renders the Obsidian Markdown content.
 */
const ObsidianMarkdown = memo(function ObsidianMarkdown({
  content,
  scale = 'base',
  linkifyFileMentions: shouldLinkifyFileMentions = false,
}: ObsidianMarkdownProps) {
  const app = useApp()
  const chatView = useChatView()
  const containerRef = useRef<HTMLDivElement>(null)
  const renderedContent = useStreamingThrottle(content)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Streaming re-renders this repeatedly. Each render owns its own
    // Component so code block processors (plotly, dataview, ...) from the
    // previous render are unloaded instead of piling up on the chat view, and
    // a render that finishes late cannot wire links into the newer DOM twice.
    const renderChild = new Component()
    chatView.addChild(renderChild)
    let current = true
    const sourcePath = app.workspace.getActiveFile()?.path ?? ''
    container.innerHTML = ''
    MarkdownRenderer.render(
      app,
      renderedContent,
      container,
      sourcePath,
      renderChild,
    )
      .then(() => {
        if (!current) return
        if (shouldLinkifyFileMentions) {
          linkifyVaultFileMentions(container, getVaultFileMentionIndex(app))
        }
        setupMarkdownLinks(app, container, sourcePath)
      })
      .catch((error: unknown) => {
        if (current) console.error('Failed to render markdown', error)
      })
    return () => {
      current = false
      chatView.removeChild(renderChild)
    }
  }, [app, renderedContent, chatView, shouldLinkifyFileMentions])

  return (
    <div
      ref={containerRef}
      className={`markdown-rendered verbex-markdown-rendered verbex-scale-${scale}`}
    />
  )
})

/**
 * Adds click and hover handlers to internal links rendered by MarkdownRenderer.render().
 * Required because rendered links are not interactive by default.
 *
 * @see https://forum.obsidian.md/t/internal-links-dont-work-in-custom-view/90169/3
 */
export function setupMarkdownLinks(
  app: App,
  containerEl: HTMLElement,
  sourcePath: string,
  showLinkHover?: boolean,
) {
  containerEl.querySelectorAll('a.internal-link').forEach((el) => {
    el.addEventListener('click', (evt: MouseEvent) => {
      evt.preventDefault()
      const linktext = el.getAttribute('href')
      if (linktext) {
        const citation = parseCitationLink(linktext)
        if (citation) {
          void openSourceCitation(
            app,
            citation,
            Boolean(Keymap.isModEvent(evt)),
          )
          return
        }
        void app.workspace.openLinkText(
          linktext,
          sourcePath,
          Keymap.isModEvent(evt),
        )
      }
    })

    if (showLinkHover) {
      el.addEventListener('mouseover', (event: MouseEvent) => {
        event.preventDefault()
        const linktext = el.getAttribute('href')
        if (linktext) {
          app.workspace.trigger('hover-link', {
            event,
            source: 'preview',
            hoverParent: { hoverPopover: null },
            targetEl: event.currentTarget,
            linktext: linktext,
            sourcePath: sourcePath,
          })
        }
      })
    }
  })
}

function ObsidianCodeBlock({
  content,
  language,
  scale = 'sm',
}: {
  content: string
  language?: string
  scale?: 'xs' | 'sm' | 'base'
}) {
  const fence = getMarkdownCodeFence(content)
  return (
    <div className="verbex-obsidian-code-block">
      <ObsidianMarkdown
        content={`${fence}${language ?? ''}\n${content}\n${fence}`}
        scale={scale}
      />
    </div>
  )
}

function getMarkdownCodeFence(content: string): string {
  const longestBacktickRun = Math.max(
    2,
    ...Array.from(content.matchAll(/`+/g), (match) => match[0].length),
  )
  return '`'.repeat(longestBacktickRun + 1)
}

export { ObsidianCodeBlock, ObsidianMarkdown }
