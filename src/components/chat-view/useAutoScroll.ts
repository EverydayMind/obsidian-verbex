import { useCallback, useEffect, useRef } from 'react'

const PROGRAMMATIC_SCROLL_DEBOUNCE_MS = 50
const SCROLL_AWAY_FROM_BOTTOM_THRESHOLD = 20
// Message markdown renders asynchronously (and is throttled while streaming),
// so content often grows after autoScrollToBottom ran. While a stream is being
// followed, DOM growth inside this window keeps the view pinned to the bottom.
export const FOLLOW_RENDER_WINDOW_MS = 1000

type UseAutoScrollProps = {
  scrollContainerRef: React.RefObject<HTMLElement>
}

export function useAutoScroll({ scrollContainerRef }: UseAutoScrollProps) {
  const preventAutoScrollRef = useRef(false)
  const lastProgrammaticScrollRef = useRef<number>(0)
  const followUntilRef = useRef<number>(0)

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      // If the scroll event happened very close to our programmatic scroll, ignore it
      if (
        Date.now() - lastProgrammaticScrollRef.current <
        PROGRAMMATIC_SCROLL_DEBOUNCE_MS
      ) {
        return
      }

      preventAutoScrollRef.current =
        scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.clientHeight >
        SCROLL_AWAY_FROM_BOTTOM_THRESHOLD
    }

    scrollContainer.addEventListener('scroll', handleScroll)
    const observer =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver(() => {
            if (
              preventAutoScrollRef.current ||
              Date.now() > followUntilRef.current
            )
              return
            lastProgrammaticScrollRef.current = Date.now()
            scrollContainer.scrollTop = scrollContainer.scrollHeight
          })
    observer?.observe(scrollContainer, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll)
      observer?.disconnect()
    }
  }, [scrollContainerRef])

  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      const scrollContainer = scrollContainerRef.current
      if (scrollContainer.scrollTop !== scrollContainer.scrollHeight) {
        lastProgrammaticScrollRef.current = Date.now()
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }, [scrollContainerRef])

  // Auto-scrolls to bottom only if the scroll position is near the bottom
  const autoScrollToBottom = useCallback(() => {
    if (!preventAutoScrollRef.current) {
      followUntilRef.current = Date.now() + FOLLOW_RENDER_WINDOW_MS
      scrollToBottom()
    }
  }, [scrollToBottom])

  // Forces scroll to bottom regardless of current position
  const forceScrollToBottom = useCallback(() => {
    preventAutoScrollRef.current = false
    followUntilRef.current = Date.now() + FOLLOW_RENDER_WINDOW_MS
    scrollToBottom()
  }, [scrollToBottom])

  return {
    autoScrollToBottom,
    forceScrollToBottom,
  }
}
