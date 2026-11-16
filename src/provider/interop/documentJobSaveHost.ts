import { documentJobHost } from './documentJobHost'
import { DocumentJobSave } from './documentJobSave'
import type { NativeProviderHost } from './NativeProviderHost'

const services = new WeakMap<NativeProviderHost, DocumentJobSave>()
export function documentJobSaveHost(host: NativeProviderHost): DocumentJobSave {
  let service = services.get(host)
  if (!service) {
    service = new DocumentJobSave(
      host.hostContext(),
      host.options,
      documentJobHost(host).store,
    )
    services.set(host, service)
  }
  return service
}
