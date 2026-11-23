import type { App } from 'obsidian'
import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from 'react'

const STORAGE_KEY = 'verbex-related-search-height'
const DEFAULT_HEIGHT = 240
/** Title, two lines of description and the search box. */
const MIN_HEIGHT = 128
/** What stays for the graph above the bottom panel. */
const MIN_ABOVE = 120
const KEY_STEP = 24

type Storage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>

function loadHeight(app: Partial<Storage>): number {
  try {
    const stored: unknown = app.loadLocalStorage?.(STORAGE_KEY)
    return typeof stored === 'number' && Number.isFinite(stored)
      ? Math.max(MIN_HEIGHT, stored)
      : DEFAULT_HEIGHT
  } catch {
    return DEFAULT_HEIGHT
  }
}

function saveHeight(app: Partial<Storage>, height: number): void {
  try {
    app.saveLocalStorage?.(STORAGE_KEY, height)
  } catch {
    // Only a convenience: the next open starts at the default height.
  }
}

export type ResizablePanel = {
  height: number
  separatorProps: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    onPointerMove: (event: PointerEvent<HTMLElement>) => void
    onPointerUp: (event: PointerEvent<HTMLElement>) => void
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  }
}

/**
 * Height of a panel at the bottom of `containerRef`, set by dragging the
 * separator above it (or arrow keys on it) and kept per vault.
 */
export function useResizablePanelHeight(
  app: App,
  containerRef: RefObject<HTMLElement | null>,
): ResizablePanel {
  const [height, setHeight] = useState(() => loadHeight(app))
  const heightRef = useRef(height)
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const clamp = useCallback(
    (value: number) => {
      const total = containerRef.current?.clientHeight ?? 0
      const max = total > 0 ? Math.max(MIN_HEIGHT, total - MIN_ABOVE) : value
      return Math.round(Math.min(Math.max(value, MIN_HEIGHT), max))
    },
    [containerRef],
  )

  const apply = useCallback(
    (value: number) => {
      const next = clamp(value)
      heightRef.current = next
      setHeight(next)
      return next
    },
    [clamp],
  )

  const endDrag = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (!dragRef.current) return
      dragRef.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      saveHeight(app, heightRef.current)
    },
    [app],
  )

  return {
    height,
    separatorProps: {
      onPointerDown: (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        // A stored height taller than this pane is shown capped (CSS); start
        // from the capped height so the first pixels of a drag do something.
        dragRef.current = {
          startY: event.clientY,
          startHeight: apply(heightRef.current),
        }
      },
      onPointerMove: (event) => {
        const drag = dragRef.current
        if (!drag) return
        // The separator sits above the panel: dragging up makes it taller.
        apply(drag.startHeight + drag.startY - event.clientY)
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown: (event) => {
        const delta =
          event.key === 'ArrowUp'
            ? KEY_STEP
            : event.key === 'ArrowDown'
              ? -KEY_STEP
              : 0
        if (delta === 0) return
        event.preventDefault()
        saveHeight(app, apply(apply(heightRef.current) + delta))
      },
    },
  }
}
