import { DocumentJobPrepare } from './documentJobPrepare'
import type { NativeProviderHost } from './NativeProviderHost'

const services = new WeakMap<NativeProviderHost, DocumentJobPrepare>()

/** One transient job store per provider host without extending its lifetime. */
export function documentJobHost(host: NativeProviderHost): DocumentJobPrepare {
  let service = services.get(host)
  if (!service) {
    const context = host.hostContext()
    service = new DocumentJobPrepare(context.app, context, host.options)
    services.set(host, service)
  }
  return service
}
