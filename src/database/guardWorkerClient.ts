import { forwardRejection } from '../utils/forwardRejection'
/** Reject pending opt-in worker operations if the worker reports a fatal error.
 * The result may already have had effects; never retry or replace the database. */
export function guardWorkerClient<T extends object>(
  worker: Worker,
  client: T,
): T {
  let failure: Error | undefined
  const pending = new Set<(error: Error) => void>()
  const fail = (error: Error) => {
    if (failure) return
    failure = error
    for (const reject of pending) reject(error)
    pending.clear()
  }
  const failed = () =>
    fail(new Error('PGlite worker failed; operation outcome is unknown.'))
  worker.addEventListener('error', failed)
  try {
    worker.addEventListener('messageerror', failed)
  } catch (error) {
    worker.removeEventListener('error', failed)
    throw error
  }
  const detach = () => {
    worker.removeEventListener('error', failed)
    worker.removeEventListener('messageerror', failed)
  }
  const guardPromise = (result: Promise<unknown>) =>
    new Promise<unknown>((resolve, reject) => {
      if (failure) reject(failure)
      else pending.add(reject)
      void result.then(
        (output: unknown) => {
          pending.delete(reject)
          resolve(output)
        },
        (error: unknown) => {
          pending.delete(reject)
          forwardRejection(reject, error)
        },
      )
    })
  const methods = new Map<PropertyKey, unknown>()
  return new Proxy(client, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target)
      if (value instanceof Promise) return guardPromise(value)
      if (typeof value !== 'function') return value
      if (methods.has(key)) return methods.get(key)
      const wrapped = (...args: unknown[]) => {
        if (key === 'close') {
          fail(new Error('PGlite worker closed; operation outcome is unknown.'))
          detach()
          return Reflect.apply(value, target, args) as unknown
        }
        if (failure) throw failure
        const result: unknown = Reflect.apply(value, target, args)
        if (!(result instanceof Promise)) return result
        return guardPromise(result)
      }
      methods.set(key, wrapped)
      return wrapped
    },
  })
}
