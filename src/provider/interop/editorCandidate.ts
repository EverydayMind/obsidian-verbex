import type { ProviderHandle } from './discovery'
import type { ProviderDescriptor } from './protocol'
import type { EditorCandidate } from './turnScope'

/** Capture capability of a discovered provider, if present. */
export function editorCandidate(
  found:
    | {
        handle: ProviderHandle
        descriptor: ProviderDescriptor
        digest: string
        generation: number
      }
    | undefined,
  busy: () => boolean,
): EditorCandidate[] {
  if (!found?.handle.editor) return []
  return [
    {
      providerId: found.handle.pluginId,
      generation: found.generation,
      digest: found.digest,
      resourceTypes: found.descriptor.tools.flatMap(
        (tool) => tool.resourceTypes,
      ),
      busy,
      ...found.handle.editor,
    },
  ]
}
