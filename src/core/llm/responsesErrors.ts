/** Protocol/configuration errors must not be retried as network failures. */
export class ResponsesProtocolError extends Error {
  readonly retryable = false

  constructor(
    message: string,
    readonly partialText?: string,
  ) {
    super(message)
    this.name = 'ResponsesProtocolError'
  }
}

export class OpenAIConfigurationError extends Error {
  readonly retryable = false

  constructor(message: string) {
    super(message)
    this.name = 'OpenAIConfigurationError'
  }
}
