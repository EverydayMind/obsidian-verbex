/** Responses protocol state is private to an in-memory agent transcript. */
export type ResponsesOutputItem =
  | {
      type: 'message'
      id: string
      role: 'assistant'
      status?: string
      phase?: string
      content: (
        | { type: 'output_text'; text: string; annotations?: unknown[] }
        | { type: 'refusal'; refusal: string }
      )[]
      [key: string]: unknown
    }
  | {
      type: 'function_call'
      id: string
      call_id: string
      name: string
      arguments: string
      status?: string
      [key: string]: unknown
    }
  | {
      type: 'reasoning'
      id: string
      encrypted_content?: string | null
      summary: unknown[]
      status?: string
      [key: string]: unknown
    }

export type ResponsesScope = { configHash: string; turnId: string }

export type ResponsesReplayState = {
  protocol: 'responses'
  scope: ResponsesScope
  items: ResponsesOutputItem[]
  /** Authenticates state after the disclosure boundary clones its snapshot. */
  seal: string
}

export type ResponsesWireResponse = {
  id: string
  model: string
  created_at?: number
  status: string
  output: ResponsesOutputItem[]
  incomplete_details?: { reason?: string } | null
  error?: { code?: string; message?: string } | null
  usage?: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
    input_tokens_details?: { cached_tokens?: number }
    output_tokens_details?: { reasoning_tokens?: number }
  } | null
}
