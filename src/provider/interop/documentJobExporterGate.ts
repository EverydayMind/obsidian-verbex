import { pluginIsEnabled } from './discovery'
import { readDerivedExportOptions } from './documentJobPorts'
import { assessDocumentJobReadiness } from './documentJobReadiness'
import type { HostContext } from './editorActions'
import type { NativeHostOptions } from './hostOptions'
import { hostReadCause } from './hostReadFailure'
import type { JsonObject } from './protocol'

export function exporterCurrentCause(
  host: HostContext,
  options: NativeHostOptions,
) {
  if (host.getActiveDiscovered('md-to-hwpx'))
    return host.currentProviderCause?.('md-to-hwpx') ?? 'provider_not_current'
  const enabled =
    pluginIsEnabled(host.app, 'md-to-hwpx') ||
    options.list?.(host.app).some((plugin) => plugin.id === 'md-to-hwpx')
  return enabled ? 'discovery_error' : 'not_installed'
}

/** All readiness checkpoints preserve the same typed currentness cause. */
export async function documentJobExporterGate(
  host: HostContext,
  options: NativeHostOptions,
  signal?: AbortSignal,
  binding?: { descriptorDigest: string; policyRevision: number },
) {
  const unavailable = () => ({
    reason: 'exporter_unavailable',
    details: { cause: exporterCurrentCause(host, options) } as JsonObject,
  })
  if (!host.getActiveDiscovered('md-to-hwpx') || !host.isCurrent('md-to-hwpx'))
    return { blocked: unavailable() }
  if (!binding) {
    try {
      await readDerivedExportOptions(host, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      return {
        blocked:
          error instanceof Error && error.message === 'exporter_outdated'
            ? { reason: 'exporter_outdated' }
            : {
                reason: 'exporter_unavailable',
                details: { cause: hostReadCause(error) },
              },
      }
    }
  }
  const readiness = assessDocumentJobReadiness(host, options, binding)
  if (readiness.state === 'unavailable') return { blocked: unavailable() }
  if (readiness.state === 'not_ready')
    return {
      blocked: {
        reason: 'exporter_commit_not_ready',
        details: { cause: readiness.cause },
      },
    }
  return { readiness }
}
