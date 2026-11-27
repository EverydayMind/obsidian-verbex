import type { HostAdvertisement } from '../../../contracts/agentinterop/host-capabilities-v1/protocol'

import { deepFreeze } from './descriptorReader'
import { AGENTINTEROP_PROTOCOL } from './protocol'

/** Where sibling plugins look for the host (host-capabilities-v1 section 6). */
export const HOST_ADVERTISEMENT = Symbol.for('dev.agentinterop.host')

const CONTRACT = 'host-capabilities-v1'

export function hostAdvertisement(hostVersion: string): HostAdvertisement {
  return deepFreeze({
    protocol: AGENTINTEROP_PROTOCOL,
    contracts: [CONTRACT],
    hostVersion,
  })
}

/**
 * Publishes the advertisement as a plain frozen data property: no getter, so
 * a reader never runs host code. Not writable, so only unload removes it.
 */
export function installHostAdvertisement(
  plugin: object,
  hostVersion: string,
): void {
  Object.defineProperty(plugin, HOST_ADVERTISEMENT, {
    value: hostAdvertisement(hostVersion),
    enumerable: false,
    writable: false,
    configurable: true,
  })
}

export function removeHostAdvertisement(plugin: object): void {
  Reflect.deleteProperty(plugin, HOST_ADVERTISEMENT)
}
