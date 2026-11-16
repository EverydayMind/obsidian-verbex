import type { App } from 'obsidian'

import * as modelText from './connectorModelText'
import type { ConnectorManifest } from './manifestSchema'

export type ConnectorTarget = {
  object: object
  plugin: object
  version: string
  generation: number
  identityObject: object
  transientApi: boolean
}

function propertyDescriptor(
  object: object,
  name: string,
): PropertyDescriptor | undefined {
  let current: object | null = object
  for (let depth = 0; current && depth < 4; depth++) {
    if (current === Object.prototype || current === Function.prototype)
      return undefined
    const descriptor = Object.getOwnPropertyDescriptor(current, name)
    if (descriptor) return descriptor
    current = Object.getPrototypeOf(current) as object | null
  }
  return undefined
}

export function dataProperty(object: unknown, name: string): unknown {
  if (!object || (typeof object !== 'object' && typeof object !== 'function'))
    throw new Error('API object unavailable.')
  const descriptor = propertyDescriptor(object, name)
  if (!descriptor || !('value' in descriptor))
    throw new Error(`API property ${name} is unavailable or is an accessor.`)
  return descriptor.value
}

export function resolveConnectorTarget(
  app: App,
  manifest: ConnectorManifest,
  objectId: (object: object) => number,
): ConnectorTarget {
  const plugins = (
    app as unknown as {
      plugins?: {
        enabledPlugins: Set<string>
        plugins: Record<string, { manifest: { version: string } }>
      }
    }
  ).plugins
  if (!plugins?.enabledPlugins?.has(manifest.target.pluginId))
    throw new Error(modelText.targetDisabled())
  const plugin = plugins.plugins[manifest.target.pluginId]
  if (!plugin || typeof plugin.manifest?.version !== 'string')
    throw new Error(modelText.targetInvalid())
  let object: unknown = plugin
  let identityObject: object = plugin
  let transientApi = false
  const access = manifest.target.access
  if (access.kind === 'global') object = dataProperty(globalThis, access.name)
  else
    for (const key of access.path) {
      if (
        !object ||
        (typeof object !== 'object' && typeof object !== 'function')
      )
        throw new Error(modelText.apiObjectMissing())
      const descriptor = propertyDescriptor(object, key)
      // Tasks 8.4.0 publishes a pure getter returning a fresh API wrapper.
      // Arbitrary plugin getters remain outside the declarative contract.
      if (
        descriptor?.get &&
        manifest.target.pluginId === 'obsidian-tasks-plugin' &&
        access.path.length === 1 &&
        key === 'apiV1'
      ) {
        // Retain getter identity; invoke it with its receiver below.
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Preserve the getter identity for comparison
        identityObject = descriptor.get
        transientApi = true
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Invoke the getter with its original receiver
        object = Reflect.apply(descriptor.get, object, [])
      } else object = dataProperty(object, key)
    }
  if (!object || (typeof object !== 'object' && typeof object !== 'function'))
    throw new Error(modelText.apiObjectMissing())
  if (!transientApi) identityObject = object
  return {
    object,
    plugin,
    version: plugin.manifest.version,
    identityObject,
    transientApi,
    generation: objectId(identityObject),
  }
}
