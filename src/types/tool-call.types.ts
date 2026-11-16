import type { ConnectorDisclosure } from './llm/request'

export type ToolCallRequest = {
  id: string
  name: string
  arguments?: string
}

export type ToolCallResponse = {
  readFacts?: import('../core/tools/readFacts').ReadFacts
  binaryReceipt?: import('../core/llm/toolOutcome').AgentToolOutcome['binaryReceipt']
  reportStyleReceipt?: import('../core/llm/toolOutcome').AgentToolOutcome['reportStyleReceipt']
} & (
  | {
      status:
        | ToolCallResponseStatus.PendingApproval
        | ToolCallResponseStatus.Rejected
        | ToolCallResponseStatus.Running
    }
  | {
      status: ToolCallResponseStatus.Success
      data: {
        type: 'text'
        text: string
        disclosure?: ConnectorDisclosure
      }
    }
  | {
      status: ToolCallResponseStatus.Error
      error: string
    }
  | {
      status: ToolCallResponseStatus.Aborted
    }
)

export enum ToolCallResponseStatus {
  PendingApproval = 'pending_approval',
  Rejected = 'rejected',
  Running = 'running',
  Success = 'success',
  Error = 'error',
  Aborted = 'aborted',
}
