import type { selectNativeTools } from './exposurePolicy'
import {
  type ExposureProviderSummary,
  exposureProviderSummaries,
} from './exposureProviderSummary'
import type { NativeProviderStatus, NativeToolEntry } from './hostScanTypes'
import type { NativeProviderHost } from './NativeProviderHost'
import {
  NATIVE_TOOL_PREFIX,
  type NativeProviderApproval,
  nativeToolName,
} from './protocol'
import type { NativeTurnScope, ScopeCaptureStatus } from './turnScope'

export type ExposureGateReason = {
  name: string
  reason: 'not_ready' | 'tool_disabled' | 'effect_hidden' | 'unknown'
  detail?: string
}

/** Early gates for discovered descriptors. No path, prompt or model output is inspected. */
export function exposureGateReasons(input: {
  statuses: readonly NativeProviderStatus[]
  approvals: readonly NativeProviderApproval[]
  entries: readonly NativeToolEntry[]
  requested: readonly string[]
}): ExposureGateReason[] {
  const available = new Set(input.entries.map((entry) => entry.name))
  const known = new Set<string>()
  const reasons: ExposureGateReason[] = []
  for (const status of input.statuses) {
    const matches = input.approvals.filter(
      (item) => item.providerId === status.providerId,
    )
    const approval = matches[0]
    for (const tool of status.descriptor?.tools ?? []) {
      const name = nativeToolName(status.providerId, tool.name)
      known.add(name)
      if (matches.length > 1) {
        reasons.push({ name, reason: 'not_ready', detail: 'error' })
      } else if (status.state !== 'active') {
        reasons.push({ name, reason: 'not_ready', detail: status.state })
      } else if (!approval) {
        reasons.push({ name, reason: 'not_ready', detail: 'pending' })
      } else if (
        approval.approvedDescriptorDigest !== status.digest ||
        approval.approvedPluginVersion !== status.pluginVersion
      ) {
        reasons.push({ name, reason: 'not_ready', detail: 'reapproval' })
      } else if (!approval.enabled) {
        reasons.push({ name, reason: 'not_ready', detail: 'disabled' })
      } else if (approval?.disabledToolNames.includes(tool.name)) {
        reasons.push({ name, reason: 'tool_disabled' })
      } else if (
        !available.has(name) &&
        ['session', 'commit', 'browser'].includes(tool.effect)
      ) {
        reasons.push({ name, reason: 'effect_hidden', detail: tool.effect })
      } else if (!available.has(name)) {
        // A changing or inconsistent snapshot must not claim a specific cause.
        reasons.push({ name, reason: 'not_ready', detail: 'error' })
      }
    }
  }
  for (const name of new Set(input.requested))
    if (!known.has(name)) reasons.push({ name, reason: 'unknown' })
  return reasons
}

/** Capture the same admitted entries used by selection, before any async work. */
export function snapshotNativeExposure(
  host: NativeProviderHost | undefined,
  requested: readonly string[],
) {
  const entries = host?.getEntries() ?? []
  let gates: ExposureGateReason[] = []
  let providers: ExposureProviderSummary[] = []
  let gateCollectionFailed = false
  try {
    if (host && !host.getExposureApprovals) gateCollectionFailed = true
    else if (host?.getExposureApprovals) {
      const statuses = host.getStatuses()
      const approvals = host.getExposureApprovals()
      gates = exposureGateReasons({
        statuses,
        approvals,
        entries,
        requested: requested.filter((name) =>
          name.startsWith(NATIVE_TOOL_PREFIX),
        ),
      })
      providers = exposureProviderSummaries(statuses, approvals, gates)
    }
  } catch {
    gateCollectionFailed = true
  }
  return { entries, gates, providers, gateCollectionFailed }
}

/** Keep diagnostic collection failure independent of the submitted request. */
export function nativeExposureTrace(
  snapshot: ReturnType<typeof snapshotNativeExposure>,
  selection: Awaited<ReturnType<typeof selectNativeTools>>,
  recording?: {
    host?: NativeProviderHost
    input: {
      runId: string
      conversationId?: string
      currentFile?: { path: string } | null
      pinnedConnectorTools?: string[]
    }
    scope?: NativeTurnScope
    scopeStatus?: ScopeCaptureStatus
    required: readonly string[]
  },
) {
  const trace = {
    gates: snapshot.gates,
    gateCollectionFailed: snapshot.gateCollectionFailed,
    attempts: selection.attempts,
    availableReasons: selection.availableReasons,
    demotions: selection.demotions,
  }
  try {
    recording?.host?.diagnostics?.recordExposure?.({
      runId: recording.input.runId,
      conversationId: recording.input.conversationId,
      currentPath: recording.input.currentFile?.path,
      scope: recording.scope,
      scopeStatus: recording.scopeStatus,
      requested: [
        ...recording.required,
        ...(recording.input.pinnedConnectorTools ?? []),
      ],
      entries: snapshot.entries,
      providers: snapshot.providers,
      exposedNames: selection.definitions.map(
        (definition) => definition.function.name,
      ),
      tokens: selection.tokens,
      omitted: selection.omitted,
      trace,
    })
  } catch {
    /* Diagnostics must not change selection or execution. */
  }
  return trace
}
export type NativeExposureTrace = ReturnType<typeof nativeExposureTrace>
