import type { AgentToolOutcome } from '../../core/llm/toolOutcome'

import { type BrowserRuntime, executeBrowserTool } from './browserExecution'
import { executeCommitTool } from './commitExecution'
import type { CommitRuntime } from './commitPrepare'
import { type NativeCall, executeReadTool } from './readExecution'
import {
  type SessionApprovalHandler,
  executeSessionTool,
} from './sessionExecution'
import type { SessionGrantStore } from './sessionGrants'

/** Hands one validated call to the runner of its declared effect. */
export async function runNativeEffect(
  call: NativeCall,
  host: {
    browser?: BrowserRuntime
    providerName: string
    grants: SessionGrantStore
    approveSession?: SessionApprovalHandler
    /** Absent while the host's commit switch is off. */
    commit?: CommitRuntime
  },
): Promise<AgentToolOutcome> {
  const { providerName } = host
  if (call.tool.resourceKind === 'browser' || call.tool.effect === 'browser') {
    const result =
      call.tool.effect === 'browser'
        ? await executeBrowserTool(call, host.browser)
        : await executeReadTool(call)
    return { ...result, privateTranscript: true }
  }
  switch (call.tool.effect) {
    case 'session':
      return executeSessionTool({
        ...call,
        providerName,
        grants: host.grants,
        approve: host.approveSession,
      })
    case 'commit':
      return executeCommitTool({ ...call, providerName, runtime: host.commit })
    default:
      return executeReadTool(call)
  }
}
