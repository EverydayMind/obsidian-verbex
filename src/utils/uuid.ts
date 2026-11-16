import { runtimeGlobal } from '../platform/runtime'
/** Generate a UUID without an ESM-only runtime dependency. */
export function uuidv4(): string {
  return runtimeGlobal().crypto.randomUUID()
}
