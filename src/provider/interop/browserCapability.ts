import { readDataMember } from './descriptorReader'

type Method = (...args: unknown[]) => unknown
const methods = ['resolveTarget', 'prepare', 'execute', 'status'] as const
export type BrowserCapability = {
  receiver: object
  captureContext?: Method
  rejectPrepared?: Method
  resolveTarget: Method
  prepare: Method
  execute: Method
  status: Method
}

export function readBrowserCapability(
  provider: object,
): BrowserCapability | undefined {
  const receiver = readDataMember(provider, 'browser')
  if (!receiver || typeof receiver !== 'object') return undefined
  const entries = methods.map((key) => [key, readDataMember(receiver, key)])
  if (entries.some(([, value]) => typeof value !== 'function')) return undefined
  const optional = ['captureContext', 'rejectPrepared'].map((key) => [
    key,
    readDataMember(receiver, key),
  ])
  if (
    optional.some(
      ([, value]) => value !== undefined && typeof value !== 'function',
    )
  )
    return undefined
  return {
    receiver,
    ...Object.fromEntries(entries),
    ...Object.fromEntries(
      optional.filter(([, value]) => typeof value === 'function'),
    ),
  } as BrowserCapability
}

export function sameBrowserCapability(
  a?: BrowserCapability,
  b?: BrowserCapability,
): boolean {
  return (
    a?.receiver === b?.receiver &&
    a?.captureContext === b?.captureContext &&
    a?.rejectPrepared === b?.rejectPrepared &&
    methods.every((key) => a?.[key] === b?.[key])
  )
}
