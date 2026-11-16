import { copyJson } from './descriptorReader'
import { dropNullOptionalArgs } from './nullOptionalArgs'
import type { JsonObject, ToolDescriptor } from './protocol'
import * as schema from './schemaSubset'

export function snapshotNativeToolArgs(input: Record<string, unknown>): {
  args: JsonObject
  problem?: string
} {
  let args: JsonObject
  try {
    args = copyJson(input, {
      maxDepth: 12,
      maxNodes: 5000,
      maxBytes: 64 * 1024,
    }) as JsonObject
  } catch {
    return { args: {}, problem: schema.argumentSizeMessage() }
  }
  return { args }
}

/** Providers run in-process; give them a copy rather than the host's verified arguments. */
export function copyNativeToolArgs(args: JsonObject): JsonObject {
  const snapshot = snapshotNativeToolArgs(args)
  if (snapshot.problem) throw new Error(snapshot.problem)
  return snapshot.args
}

export function nativeToolArgs(
  input: Record<string, unknown>,
  tool: ToolDescriptor,
): { args: JsonObject; problem?: string } {
  const snapshot = snapshotNativeToolArgs(input)
  if (snapshot.problem) return snapshot
  return validateNativeToolArgs(snapshot.args, tool)
}

/** Validate a private snapshot returned by snapshotNativeToolArgs. */
export function validateNativeToolArgs(
  args: JsonObject,
  tool: ToolDescriptor,
): { args: JsonObject; problem?: string } {
  const normalized = dropNullOptionalArgs(args, tool.inputSchema)
  const problem = schema.argumentProblem(tool.inputSchema, normalized)
  return problem
    ? { args: normalized, problem: schema.schemaMismatchMessage(problem) }
    : { args: normalized }
}
