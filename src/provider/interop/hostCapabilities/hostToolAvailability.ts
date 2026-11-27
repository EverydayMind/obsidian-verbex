import type { Discovered, NativeProviderStatus } from '../hostScanTypes'
import { nativeToolName } from '../protocol'

import { type UnavailableTool, readToolAvailability } from './toolAvailability'

/** The provider's live hide-only list for tools in its own descriptor. */
export function providerUnavailableTools(found: Discovered): UnavailableTool[] {
  const receiver = found.hostMembers?.receiver
  if (!receiver) return []
  return readToolAvailability(
    receiver,
    new Set(found.descriptor.tools.map((tool) => tool.name)),
  )
}

/**
 * Host-capabilities-v1 section 8, read live and only for approved, current
 * providers (`current`). Nothing here is stored, digested or approval data.
 */
export class HostToolAvailability {
  constructor(
    private readonly discovered: () => ReadonlyMap<string, Discovered>,
    private readonly current: (found: Discovered) => boolean,
  ) {}

  /** Host tool name -> the provider's people-only reason, for hidden tools. */
  hidden(): Map<string, string> {
    const hidden = new Map<string, string>()
    for (const [id, found] of this.discovered()) {
      if (!this.current(found)) continue
      for (const item of providerUnavailableTools(found))
        hidden.set(nativeToolName(id, item.name), item.reason)
    }
    return hidden
  }

  /** The status with its hidden tools attached (only when there are any). */
  withStatus(status: NativeProviderStatus): NativeProviderStatus {
    const found = this.discovered().get(status.providerId)
    const unavailableTools =
      found && this.current(found) ? providerUnavailableTools(found) : []
    return unavailableTools.length ? { ...status, unavailableTools } : status
  }
}
