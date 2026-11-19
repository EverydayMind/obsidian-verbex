import { assertNotAiPrivate } from '../../security/aiPrivateRefusal'

import type { StyleApi } from './styleApiTypes'

const guarded = new WeakSet()

/**
 * Every StyleApi method that takes a `path` reads that document live. The
 * guard refuses an AI-private path before the call leaves, so no caller
 * (profile views, re-measurement, draft checks, sample decomposition) can
 * bring its text into model context. Calls without a path replay saved,
 * text-free evidence and pass through.
 */
export function guardStyleApi(api: StyleApi): StyleApi {
  if (guarded.has(api)) return api
  const proxy = new Proxy(api, {
    get(target, key) {
      const member: unknown = Reflect.get(target, key, target)
      if (typeof member !== 'function') return member
      return (...args: unknown[]): unknown => {
        const path = (args[0] as { path?: unknown } | null | undefined)?.path
        if (typeof path === 'string') assertNotAiPrivate(path)
        return Reflect.apply(member, target, args)
      }
    },
  })
  guarded.add(proxy)
  return proxy
}
