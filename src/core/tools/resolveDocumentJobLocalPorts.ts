import { documentJobLocalPorts } from '../../provider/interop/documentJobLocalPorts'
import type { ProviderRegistrySnapshot } from '../../provider/providerTurnTypes'
import {
  baseChangePreparer,
  composeLocalChangePreparers,
} from '../obsidian-core/baseChangePreparer'

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
    prepare: composeLocalChangePreparers(
      ports.localChangePreparer ?? defaults.prepare,
      baseChangePreparer(ports.basesEngine, ports.app),
    ),
    facts: ports.localChangeFacts ?? defaults.facts,
  }
}
