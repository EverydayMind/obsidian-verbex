import { recordProviderPageVersion } from '../../context/structuredReadObservation'
import type { ToolImage } from '../../core/llm/toolImages'
import {
  type AgentToolOutcome,
  toolFailed,
  toolSucceeded,
} from '../../core/llm/toolOutcome'

import { exporterPageVersion } from './exporterPageObservation'
import type { NativeCall } from './readExecution'
import { nativeReadRecovery } from './readRecovery'
import type { NativeToolResult } from './resultReader'

export async function nativeReadOutcome(
  call: NativeCall,
  result: NativeToolResult & { images: ToolImage[] },
  text: string,
  disclosure: {
    connectorId: string
    canonicalVaultPaths: string[]
    unattributedFiles: number
  },
  vaultEvents: number,
  affects: (path: string) => boolean,
): Promise<AgentToolOutcome> {
  const readPath = result.documentRead?.path
  const readPathChanged = !!readPath && !!vaultEvents && affects(readPath)
  const outcome = result.isError
    ? toolFailed(text, {
        documentRead: result.documentRead
          ? {
              ...result.documentRead,
              state: readPathChanged ? 'invalidated' : 'unavailable',
            }
          : undefined,
        terminal: false,
        retry: { allowed: result.retryable && !vaultEvents },
        ...(vaultEvents
          ? { evidence: { role: 'none' as const, paths: [] } }
          : {}),
        disclosure,
        mutationScope: 'none',
      })
    : toolSucceeded(text, {
        documentRead: result.documentRead
          ? {
              ...result.documentRead,
              ...(vaultEvents
                ? {
                    state: readPathChanged
                      ? ('invalidated' as const)
                      : ('unavailable' as const),
                  }
                : {}),
              provider: `${call.handle.pluginId}:${call.digest}:${call.generation}`,
            }
          : undefined,
        images: result.images.length ? result.images : undefined,
        readPage:
          result.readPage && !vaultEvents
            ? {
                ...result.readPage,
                recovery: nativeReadRecovery(
                  call.name,
                  call.tool,
                  call.args,
                  result,
                ),
              }
            : undefined,
        disclosure,
        evidence: vaultEvents
          ? { role: 'none', paths: [] }
          : { role: 'reading', paths: result.paths },
        mutationScope: 'none',
      })
  if (vaultEvents && typeof call.args.path === 'string') {
    try {
      const target = call.vaultPath(call.args.path)
      if (target !== result.documentRead?.path && affects(target))
        outcome.invalidatedReadTarget = target
    } catch {
      // Invalid call targets are not persisted as Vault paths.
    }
  }
  if (
    !result.isError &&
    !result.truncated &&
    !vaultEvents &&
    result.readPage?.continuation
  ) {
    const version = await exporterPageVersion(
      call,
      result.readPage.continuation,
    )
    if (version && !call.ctx.signal?.aborted && call.current())
      recordProviderPageVersion(outcome, version)
  }
  return outcome
}
