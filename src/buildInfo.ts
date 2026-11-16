declare const __VERBEX_VERSION__: string
declare const __VERBEX_SOURCE__: string
declare const __VERBEX_DIRTY__: boolean
declare const __VERBEX_BUILT_AT__: string
declare const __VERBEX_ARTIFACT__: string

export type VerbexBuildInfo = {
  version: string
  source: string
  dirty: boolean
  builtAt: string
  artifact: string
}

function injected<T>(read: () => T, fallback: T): T {
  try {
    return read()
  } catch {
    return fallback
  }
}

export const VERBEX_BUILD_INFO: VerbexBuildInfo = {
  version: injected(() => __VERBEX_VERSION__, '0.0.0-dev'),
  source: injected(() => __VERBEX_SOURCE__, 'unknown'),
  dirty: injected(() => __VERBEX_DIRTY__, true),
  builtAt: injected(() => __VERBEX_BUILT_AT__, 'unbuilt'),
  artifact: injected(() => __VERBEX_ARTIFACT__.trim(), 'development'),
}

export function formatVerbexBuildInfo(
  info: VerbexBuildInfo = VERBEX_BUILD_INFO,
): string {
  return `Verbex ${info.version} source=${info.source} dirty=${String(info.dirty)} builtAt=${info.builtAt} artifact=${info.artifact}`
}

export function verbexBuildRequestTag(
  info: VerbexBuildInfo = VERBEX_BUILD_INFO,
): string {
  return `verbex/${info.version} source=${info.source} dirty=${String(info.dirty)} artifact=${info.artifact}`
}
