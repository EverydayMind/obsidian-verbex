export class ToolSupportRequiredError extends Error {
  constructor(readonly modelId: string) {
    super(
      `Verbex Agent requires tool calling, but chat model "${modelId}" is configured without tool support. Enable tool support for this model or select a tool-capable chat model.`,
    )
    this.name = 'ToolSupportRequiredError'
  }
}
