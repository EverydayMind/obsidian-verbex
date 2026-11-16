import { commitAllowed } from './commitPolicy'
import type { runNativeEffect } from './effectDispatch'
import type { NativeHostOptions } from './hostOptions'
import type { NativeCall } from './readExecution'
import type { SessionGrantStore } from './sessionGrants'

export function nativeEffectOptions(
  call: NativeCall,
  options: NativeHostOptions,
  providerName: string,
  grants: SessionGrantStore,
  revision?: number,
): Parameters<typeof runNativeEffect>[1] {
  return {
    providerName,
    grants,
    approveSession: options.approveSession,
    browser:
      options.browserEffects?.() === true ? options.browserRuntime : undefined,
    commit: commitAllowed(
      options,
      { digest: call.digest, handle: call.handle },
      call.tool,
      revision,
    )
      ? options.commitRuntime
      : undefined,
  }
}
