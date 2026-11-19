import { App } from 'obsidian'
import {
  type CSSProperties,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'

import { isDocumentPath } from '../../core/rag/documentSources/indexableSources'
import type { RelatedNote } from '../../core/rag/relatedNotes'

import { openRelatedTarget } from './openRelatedTarget'
import { classifyRelatedNotes, layoutRelatedGraph } from './relatedGraphLayout'
import {
  collectPropertyLinks,
  noteTypeHues,
  noteTypeOf,
} from './relatedPropertyLinks'
import { useExitRetention } from './useExitRetention'

const EXIT_RETENTION_MS = 280
const DEFAULT_GRAPH_WIDTH = 320

type EdgeCssStyle = CSSProperties & {
  d: string
}

type NodeCssStyle = CSSProperties & {
  '--verbex-node-r': string
  '--verbex-related-node-hue'?: number
}

type RelatedNotesGraphProps = {
  app: App
  centerPath: string
  notes: readonly RelatedNote[]
  limit: number
  pendingPath: string | null
  onShowRelated: (path: string) => void
  onHoldRelated: (path: string) => void
}

function resolveCenterTitle(app: App, path: string): string {
  const file = app.vault.getFileByPath?.(path)
  if (file?.basename) return file.basename
  const name = path.split('/').pop()
  return name ? name : path
}

function circleGlyph(path: string, title: string): string {
  if (isDocumentPath(path)) {
    return (path.split('.').pop() ?? '').toUpperCase()
  }
  const first = Array.from(title.trim())[0]
  if (first) return first
  const fileFirst = Array.from(path.split('/').pop() ?? '')[0]
  return fileFirst ?? '?'
}

export function RelatedNotesGraph({
  app,
  centerPath,
  notes,
  limit,
  pendingPath,
  onShowRelated,
  onHoldRelated,
}: RelatedNotesGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(DEFAULT_GRAPH_WIDTH)
  const rawId = useId()
  const markerId = `verbex-related-arrow-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof ResizeObserver === 'undefined') return

    const updateWidth = (measured: number) => {
      if (measured > 0) setWidth(Math.round(measured))
    }

    updateWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entryWidth =
        entries[0]?.contentRect.width ?? element.getBoundingClientRect().width
      updateWidth(entryWidth)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const resolvedLinks = app.metadataCache?.resolvedLinks
  // The type colours are read together with the groups, so both follow the
  // same result: a type added to the vault gets its colour on the next load.
  const { groups, typeHues } = useMemo(
    () => ({
      groups: classifyRelatedNotes({
        activePath: centerPath,
        notes,
        resolvedLinks,
        propertyLinks: collectPropertyLinks(app, centerPath, [
          ...new Set(
            notes.flatMap((note) => [
              note.path,
              ...(note.companionPaths ?? []),
            ]),
          ),
        ]),
        limit,
      }),
      typeHues: noteTypeHues(app),
    }),
    [app, centerPath, limit, notes, resolvedLinks],
  )
  const centerTitle = resolveCenterTitle(app, centerPath)
  const layout = useMemo(
    () =>
      layoutRelatedGraph(groups, {
        width,
        center: { path: centerPath, title: centerTitle },
      }),
    [centerPath, centerTitle, groups, width],
  )

  const retainedNodes = useExitRetention(layout.nodes, EXIT_RETENTION_MS)
  const retainedEdges = useExitRetention(layout.edges, EXIT_RETENTION_MS)

  return (
    <div
      ref={containerRef}
      className="verbex-related-graph"
      style={{ height: layout.height }}
    >
      <svg
        className="verbex-related-graph-edges"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-hidden="true"
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 7 7"
            refX="6"
            refY="3.5"
            markerWidth="7"
            markerHeight="7"
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0.5 L 6 3.5 L 0 6.5 z"
              className="verbex-related-graph-marker"
            />
          </marker>
        </defs>
        {retainedEdges.map(({ item: edge, leaving }) => {
          const edgeStyle: EdgeCssStyle = { d: `path("${edge.d}")` }
          return (
            <g
              key={edge.key}
              className="verbex-related-graph-edge-group"
              data-color={edge.color ?? undefined}
            >
              <path
                className="verbex-related-graph-edge"
                data-role={edge.role}
                data-leaving={leaving ? 'true' : undefined}
                d={edge.d}
                style={edgeStyle}
                markerEnd={`url(#${markerId})`}
              />
              {edge.properties.length > 0 && !leaving && (
                <path
                  className="verbex-related-graph-edge-hit"
                  d={edge.d}
                  style={edgeStyle}
                >
                  <title>{edge.properties.join(', ')}</title>
                </path>
              )}
            </g>
          )
        })}
      </svg>

      {retainedNodes.map(({ item: node, leaving }) => {
        const isPending = !leaving && pendingPath === node.path
        // The circle takes its colour from the note's `type` property.
        const noteType = noteTypeOf(app, node.path)
        const typeHue = noteType === null ? undefined : typeHues.get(noteType)
        const nodeStyle: NodeCssStyle = {
          transform: `translate(${node.x}px, ${node.y}px)`,
          '--verbex-node-r': `${node.r}px`,
          ...(typeHue === undefined
            ? {}
            : { '--verbex-related-node-hue': typeHue }),
        }

        return (
          <button
            key={node.key}
            type="button"
            className="verbex-related-node"
            data-role={node.role}
            data-similar={node.similar ? 'true' : 'false'}
            data-typed={typeHue === undefined ? undefined : 'true'}
            data-label-side={node.labelSide}
            data-pending={isPending ? 'true' : undefined}
            data-leaving={leaving ? 'true' : undefined}
            disabled={leaving}
            style={nodeStyle}
            // No title attribute: Obsidian shows its own tooltip for
            // aria-label, and a title would add the browser's on top of it.
            aria-label={node.title}
            onClick={(event) => {
              if (leaving) return
              if (node.role !== 'center') {
                if (event.ctrlKey || event.metaKey) {
                  onHoldRelated(node.path)
                } else {
                  onShowRelated(node.path)
                }
              }
              openRelatedTarget(app, node.path, centerPath)
            }}
          >
            <span className="verbex-related-node-inner">
              <span
                className="verbex-related-node-circle"
                data-document={isDocumentPath(node.path) ? 'true' : undefined}
                aria-hidden="true"
              >
                {circleGlyph(node.path, node.title)}
              </span>
              <span className="verbex-related-node-label">{node.title}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
