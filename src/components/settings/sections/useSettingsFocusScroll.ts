import { type RefObject, useEffect, useRef } from 'react'

import type VerbexPlugin from '../../../main'

type FocusScrollWindow = Pick<
  Window,
  | 'requestAnimationFrame'
  | 'cancelAnimationFrame'
  | 'setTimeout'
  | 'clearTimeout'
> & { ResizeObserver?: typeof ResizeObserver }

type FocusScrollOptions = {
  /** Brings the jump target to the top of the visible settings area. */
  align: () => void
  /** Element whose size changes mean the layout above the target moved. */
  observed: Element | null
  doc: Document
  win: FocusScrollWindow
  /** Called once, after the first animation-frame alignment. */
  onFinal: () => void
  frames?: number
  settleMs?: number
}

const USER_EVENTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

/**
 * Aligns now, again on the next animation frames, and again whenever the
 * observed element resizes during a short settle window. Any user scroll or
 * input cancels it. Returns the cancel function.
 */
export function startFocusScroll({
  align,
  observed,
  doc,
  win,
  onFinal,
  frames = 3,
  settleMs = 1500,
}: FocusScrollOptions): () => void {
  let stopped = false
  let frame = 0
  let rafId = 0
  let observer: ResizeObserver | undefined
  let timer = 0
  const stop = () => {
    if (stopped) return
    stopped = true
    win.cancelAnimationFrame(rafId)
    win.clearTimeout(timer)
    observer?.disconnect()
    for (const type of USER_EVENTS) doc.removeEventListener(type, stop, true)
  }
  const tick = () => {
    if (stopped) return
    align()
    frame += 1
    if (frame === 1) onFinal()
    if (frame < frames) rafId = win.requestAnimationFrame(tick)
  }
  for (const type of USER_EVENTS) doc.addEventListener(type, stop, true)
  align()
  rafId = win.requestAnimationFrame(tick)
  if (observed && win.ResizeObserver) {
    observer = new win.ResizeObserver(() => {
      if (!stopped) align()
    })
    observer.observe(observed)
  }
  timer = win.setTimeout(stop, settleMs)
  return stop
}

/**
 * Handles a pending "go to tool approval" request: opens the target plugin's
 * review block (never the changed-items diff) and keeps the plugin row at the
 * top of the visible area, below the sticky tab bar, while layout settles.
 */
export function useSettingsFocusScroll({
  plugin,
  ownsFocus,
  loading,
  rootRef,
  statuses,
  focusRevision,
}: {
  plugin: VerbexPlugin
  ownsFocus: boolean
  loading: boolean
  rootRef: RefObject<HTMLElement | null>
  /** Re-run the check when host statuses or focus requests change. */
  statuses: unknown
  focusRevision: number
}) {
  const cancelRef = useRef<(() => void) | null>(null)
  useEffect(() => () => cancelRef.current?.(), [])
  useEffect(() => {
    const focus = plugin.peekSettingsFocus?.()
    const root = rootRef.current
    if (!root || !ownsFocus || loading || focus?.section !== 'tool-approval')
      return
    const target = Array.from(
      root.querySelectorAll<HTMLElement>('[data-provider-id]'),
    ).find((el) => el.dataset.providerId === focus.providerId)
    const review =
      target?.querySelector('details[data-verbex-review]') ??
      target?.querySelector('details:not([data-verbex-diff])')
    review?.setAttribute('open', '')
    const destination =
      target ??
      root
        .closest('.verbex-tool-management')
        ?.querySelector<HTMLElement>('[data-verbex-section="tool-approval"]')
    const doc = root.ownerDocument
    cancelRef.current?.()
    cancelRef.current = startFocusScroll({
      align: () => {
        const bar = doc.querySelector<HTMLElement>('.verbex-settings-tabs')
        if (destination && bar)
          destination.style.scrollMarginTop = `${bar.offsetHeight + 8}px`
        destination?.scrollIntoView?.({ block: 'start' })
      },
      observed: root.closest('.verbex-settings-tabpanel') ?? root,
      doc,
      win: doc.defaultView ?? window,
      onFinal: () => plugin.clearSettingsFocus(),
    })
  }, [plugin, ownsFocus, loading, rootRef, statuses, focusRevision])
}
