import { copyJson, readDataMember } from './descriptorReader'
import { validateNativeToolArgs } from './nativeToolArgs'
import type { JsonObject, ToolDescriptor } from './protocol'

// Only host-internal derived-export calls use this bound. The provider still
// validates the 32 KiB serialized bundle and all schema/semantic limits.
const limits = { maxDepth: 12, maxNodes: 10000, maxBytes: 128 * 1024 }

export function copyDocumentJobArgs(
  input: Record<string, unknown>,
): JsonObject {
  const bundle = readDataMember(input, 'derive_from')
  const decomposition =
    typeof readDataMember(input, 'markdown') === 'string' &&
    !!bundle &&
    typeof bundle === 'object' &&
    readDataMember(bundle, 'schema') === 'derive-bundle/3'
  return copyJson(
    input,
    decomposition ? { ...limits, maxBytes: 2 * 1024 * 1024 } : limits,
  ) as JsonObject
}

export function validateDocumentJobArgs(
  input: Record<string, unknown>,
  tool: ToolDescriptor,
) {
  try {
    return validateNativeToolArgs(copyDocumentJobArgs(input), tool)
  } catch {
    return {
      args: {},
      problem: 'Document Job arguments exceed their bounded JSON limits.',
    }
  }
}
