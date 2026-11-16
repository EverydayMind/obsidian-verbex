import type { CommitCall } from './commitCall'
import type { CommitPreparation } from './commitProtocol'
import type { ResolvedTarget } from './sessionProtocol'

export async function assertResolvedOwnership(
  call: CommitCall,
  target: ResolvedTarget,
) {
  if (target.kind === 'new')
    await call.assertOwnership?.(target.destination, { newOutput: true })
  else {
    await call.assertOwnership?.(target.document.path)
    if (target.destination) await call.assertOwnership?.(target.destination)
  }
}

export async function assertPreparedOwnership(
  call: CommitCall,
  target: ResolvedTarget,
  preparation: CommitPreparation,
) {
  if (preparation.source) await call.assertOwnership?.(preparation.source.path)
  for (const entry of preparation.writeSet) {
    if (
      target.kind === 'new' &&
      preparation.mode === 'create' &&
      (entry.kind === 'folder' || entry.sha256Before === null)
    )
      await call.assertOwnership?.(entry.path, { newOutput: true })
    else await call.assertOwnership?.(entry.path)
  }
}
