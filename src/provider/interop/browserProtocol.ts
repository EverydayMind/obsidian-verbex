import { canonicalDigest } from '../../security/promptInjectionBoundary'
import { stringifyUnknown } from '../../utils/stringifyUnknown'

import { copyJson } from './descriptorReader'
import type { JsonObject, JsonValue, ToolDescriptor } from './protocol'

export {
  readBrowserCapability,
  sameBrowserCapability,
  type BrowserCapability,
} from './browserCapability'

export function parseBrowserTool(
  meta: JsonObject,
  effect: JsonValue,
  capabilities: { protocolVersion?: number; browser?: boolean },
): Pick<ToolDescriptor, 'resourceKind' | 'browserAction'> {
  const kind = meta['dev.agentinterop/resourceKind']
  const action = meta['dev.agentinterop/browserAction']
  if (kind === undefined && action === undefined && effect !== 'browser')
    return {}
  if (
    capabilities.protocolVersion !== 2 ||
    kind !== 'browser' ||
    !capabilities.browser
  )
    throw new Error(
      'browser tools require protocol v2 and the complete browser capability',
    )
  if (effect !== 'read' && effect !== 'browser')
    throw new Error('browser resource must have read or browser effect')
  if (effect === 'browser') {
    if (
      !['tab', 'navigate', 'interact', 'console', 'script'].includes(
        stringifyUnknown(action),
      )
    )
      throw new Error('browser effect requires a valid browserAction')
    return {
      resourceKind: 'browser',
      browserAction: action as ToolDescriptor['browserAction'],
    }
  }
  if (action !== undefined)
    throw new Error('browserAction requires browser effect')
  return { resourceKind: 'browser' }
}

export function browserToolAvailable(
  tool: ToolDescriptor,
  enabled?: boolean,
): boolean {
  return (
    tool.effect !== 'browser' || (!!enabled && tool.browserAction !== 'script')
  )
}

/** v2 domain only; v1 approval digests keep their bare-hex format. */
export async function browserArgsDigest(value: unknown): Promise<string> {
  const safe = copyJson(value, {
    maxDepth: 12,
    maxNodes: 5000,
    maxBytes: 64 * 1024,
  })
  return `sha256:${await canonicalDigest(safe)}`
}
