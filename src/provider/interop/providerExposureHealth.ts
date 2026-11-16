import type { ProviderCurrentCause } from './currentProvider'
import { type PluginInstance, readProviderHandle } from './discovery'
import type { Discovered } from './hostScanTypes'
import type { ProviderRuntimeState } from './providerRuntimeState'

/** Includes faulted providers removed from discovered by the latest refresh. */
export function providerExposureHealth(
  discovered: ReadonlyMap<string, Discovered>,
  runtime: ProviderRuntimeState,
  plugins: readonly PluginInstance[],
  cause: (found: Discovered) => ProviderCurrentCause | undefined,
) {
  return (id: string) => {
    const found = discovered.get(id)
    let handle = found?.handle
    if (!handle) {
      const plugin = plugins.find((item) => item.id === id)
      try {
        handle = plugin && readProviderHandle(plugin)
      } catch {
        /* Invalid discovery shapes carry no current handle. */
      }
    }
    return {
      runtimeFault: !!(handle && runtime.fault(handle)),
      ...(found ? { currentProviderCause: cause(found) } : {}),
    }
  }
}
