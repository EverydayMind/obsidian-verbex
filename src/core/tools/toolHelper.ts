import { RequestTool } from '../../types/llm/request'

export const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): RequestTool => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: {
      type: 'object',
      properties,
      required,
    },
  },
})

export const pathProp = {
  type: 'string',
  description: 'Vault-relative file path.',
}
export const contentProp = { type: 'string', description: 'Full file content.' }
