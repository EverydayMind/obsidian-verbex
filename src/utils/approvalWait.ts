/** Counts change-review modals currently awaiting the user, for the chat progress line. */
let pending = 0
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function trackApprovalWait<T>(promise: Promise<T>): Promise<T> {
  pending += 1
  emit()
  const done = (): void => {
    pending = Math.max(0, pending - 1)
    emit()
  }
  promise.then(done, done)
  return promise
}

export function subscribeApprovalWait(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isAwaitingApproval(): boolean {
  return pending > 0
}
