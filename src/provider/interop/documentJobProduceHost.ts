import { documentJobHost } from './documentJobHost'
import { DocumentJobProduce } from './documentJobProduce'
import type { NativeProviderHost } from './NativeProviderHost'

const producers = new WeakMap<NativeProviderHost, DocumentJobProduce>()

export function documentJobProduceHost(
  host: NativeProviderHost,
): DocumentJobProduce {
  let service = producers.get(host)
  if (!service) {
    service = new DocumentJobProduce(
      host.hostContext(),
      host.options,
      documentJobHost(host).store,
    )
    producers.set(host, service)
  }
  return service
}
