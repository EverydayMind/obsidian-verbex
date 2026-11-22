import { documentJobLocalPorts } from '../../provider/interop/documentJobLocalPorts'
import type { ProviderRegistrySnapshot } from '../../provider/ProviderRegistry'

import type { AgentToolPorts } from './AgentToolExecutorPorts'

export function resolveDocumentJobLocalPorts(
  ports: AgentToolPorts,
  snapshot?: ProviderRegistrySnapshot,
) {
  const defaults = documentJobLocalPorts(
    ports.providerRegistry?.native,
    snapshot,
  )
  return {
    prepare: ports.localChangePreparer ?? defaults.prepare,
    facts: ports.localChangeFacts ?? defaults.facts,
  }
}
