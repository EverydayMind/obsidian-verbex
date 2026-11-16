import { t } from '../../i18n'

import type { ProviderHandle } from './discovery'
import { ArtifactChecks } from './providerArtifact'

/** Runtime faults survive rescans, but belong to the exact provider instance. */
export class ProviderRuntimeState {
  readonly artifactChecks = new ArtifactChecks()
  private readonly ids = new WeakMap<object, number>()
  private readonly faults = new WeakMap<object, string>()
  private sequence = 0

  id(object: object): number {
    let id = this.ids.get(object)
    if (!id) this.ids.set(object, (id = ++this.sequence))
    return id
  }

  fault(handle: ProviderHandle): string | undefined {
    return this.faults.get(handle.provider)
  }

  block(handle: ProviderHandle): void {
    this.faults.set(handle.provider, t('nativeProviderR10.runtimeFault'))
  }
}
