import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type RetainedItem<T extends { key: string }> = {
  item: T
  leaving: boolean
}

type LeavingEntry<T> = {
  item: T
  expiresAt: number
}

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function useExitRetention<T extends { key: string }>(
  items: readonly T[],
  ms: number,
): RetainedItem<T>[] {
  const prevItemsRef = useRef<readonly T[]>([])
  const [leaving, setLeaving] = useState<LeavingEntry<T>[]>([])

  useLayoutEffect(() => {
    const prevItems = prevItemsRef.current
    prevItemsRef.current = items
    const currentKeys = new Set(items.map((item) => item.key))
    const now = Date.now()
    const removed =
      ms > 0 ? prevItems.filter((item) => !currentKeys.has(item.key)) : []

    setLeaving((prev) => {
      const next = new Map<string, LeavingEntry<T>>()
      for (const entry of prev) {
        if (!currentKeys.has(entry.item.key) && entry.expiresAt > now) {
          next.set(entry.item.key, entry)
        }
      }
      for (const item of removed) {
        next.set(item.key, { item, expiresAt: now + ms })
      }
      if (next.size === 0 && prev.length === 0) return prev
      if (
        next.size === prev.length &&
        prev.every((entry) => next.get(entry.item.key) === entry)
      ) {
        return prev
      }
      return [...next.values()]
    })
  }, [items, ms])

  useEffect(() => {
    if (leaving.length === 0) return
    const now = Date.now()
    const earliest = Math.min(...leaving.map((entry) => entry.expiresAt))
    const delay = Math.max(0, earliest - now)
    const timer = window.setTimeout(() => {
      const cutoff = Date.now()
      setLeaving((prev) => prev.filter((entry) => entry.expiresAt > cutoff))
    }, delay)
    return () => window.clearTimeout(timer)
  }, [leaving])

  const currentKeys = new Set(items.map((item) => item.key))
  const merged: RetainedItem<T>[] = items.map((item) => ({
    item,
    leaving: false,
  }))
  for (const entry of leaving) {
    if (!currentKeys.has(entry.item.key)) {
      merged.push({ item: entry.item, leaving: true })
    }
  }
  merged.sort((left, right) => compareKeys(left.item.key, right.item.key))
  return merged
}
