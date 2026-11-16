import { validDocumentJobs } from '../../core/document-jobs/validJobs'
import type { TurnRecord } from '../../runstate/turnLedger'
import type { RequestTool } from '../../types/llm/request'

import { documentJobHost } from './documentJobHost'
import type { NativeProviderHost } from './NativeProviderHost'
import { projectDecompositionEditPaths } from './projectDecompositionEditPaths'

/** Pure projection: never mutate registry definitions or their nested schemas. */
export function projectDocumentJobTools(
  tools: readonly RequestTool[],
  awaitingChoice: boolean,
): RequestTool[] {
  return tools.map((tool) => {
    const copy = structuredClone(tool)
    if (copy.function.name !== 'prepare_format_reuse' || awaitingChoice)
      return copy
    const parameters = copy.function.parameters as {
      properties?: Record<string, unknown>
      required?: string[]
    }
    if (parameters.properties) {
      delete parameters.properties.job_id
      delete parameters.properties.choices
    }
    if (parameters.required)
      parameters.required = parameters.required.filter(
        (key) => key !== 'job_id' && key !== 'choices',
      )
    return copy
  })
}

export async function currentDocumentJobTools(
  tools: readonly RequestTool[],
  host: NativeProviderHost | undefined,
  conversationId: string,
  signal?: AbortSignal,
  turn?: TurnRecord,
): Promise<RequestTool[]> {
  signal?.throwIfAborted()
  const jobs =
    host && typeof host.hostContext === 'function'
      ? await validDocumentJobs({
          store: documentJobHost(host).store,
          conversationId,
          hash: (path) => documentJobHost(host).byteHash(path),
          signal,
        })
      : []
  projectDecompositionEditPaths(host, jobs, tools, turn)
  return projectDocumentJobTools(
    tools,
    jobs.some((job) => job.status.state === 'awaiting_choice'),
  )
}
