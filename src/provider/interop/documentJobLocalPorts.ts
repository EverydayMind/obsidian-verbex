import type { ProviderRegistrySnapshot } from '../providerTurnTypes'

import { documentJobChangeFacts } from './documentJobChangeFacts'
import { documentJobChangePreparer } from './documentJobChangePreparer'
import type { NativeProviderHost } from './NativeProviderHost'

export function documentJobLocalPorts(
  host?: NativeProviderHost,
  snapshot?: ProviderRegistrySnapshot,
) {
  const args = [
    host,
    snapshot?.documentJobTrigger,
    snapshot?.documentJobExplicitJobIds,
  ] as const
  return {
    prepare: documentJobChangePreparer(...args),
    facts: documentJobChangeFacts(...args),
  }
}
