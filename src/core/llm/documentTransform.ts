import { RequestMessage } from '../../types/llm/request'
import { tokenCount } from '../../utils/llm/token'

import { splitTextIntoChunks } from './chunking'

type TokenCounter = (text: string) => Promise<number>

export type DocumentTransformProgress = {
  index: number
  total: number
}

export type DocumentTransformResult = {
  text: string
  chunkCount: number
}

export async function transformLargeDocument(options: {
  document: string
  instruction: string
  inputTokenBudget: number
  outputTokenBudget: number
  runStep: (messages: RequestMessage[]) => Promise<string>
  countTokens?: TokenCounter
  documentLabel?: string
  onProgress?: (progress: DocumentTransformProgress) => void
  resumeChunks?: string[]
  onChunkComplete?: (
    progress: DocumentTransformProgress & { text: string },
  ) => void | Promise<void>
}): Promise<DocumentTransformResult> {
  const {
    document,
    instruction,
    inputTokenBudget,
    outputTokenBudget,
    runStep,
    countTokens = tokenCount,
    documentLabel,
    onProgress,
    resumeChunks = [],
    onChunkComplete,
  } = options
  const instructionTokens = await countTokens(instruction)
  const chunkBudget = Math.max(
    256,
    Math.min(
      Math.floor(inputTokenBudget * 0.5),
      Math.floor(outputTokenBudget * 0.8),
    ) - instructionTokens,
  )
  const chunks = await splitTextIntoChunks(document, {
    maxTokens: chunkBudget,
    countTokens,
  })
  const transformed: string[] = []
  for (let index = 0; index < chunks.length; index++) {
    onProgress?.({ index: index + 1, total: chunks.length })
    const resumed = resumeChunks[index]?.trim()
    if (resumed) {
      transformed.push(resumed)
      continue
    }
    const label = documentLabel ? ` (${documentLabel})` : ''
    const output = await runStep([
      {
        role: 'system',
        content:
          `You are transforming chunk ${index + 1}/${chunks.length} of one document${label}. ` +
          'Apply the instruction only to the supplied chunk. Preserve Markdown structure, links, facts, ordering, and boundary text unless the instruction explicitly changes them. Return only the transformed chunk, without fences or commentary.',
      },
      {
        role: 'user',
        content: `# Transformation instruction\n${instruction}\n\n# Source chunk ${index + 1}/${chunks.length}\n${chunks[index]}`,
      },
    ])
    const cleaned = output
      .trim()
      .replace(/^```(?:markdown|md)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim()
    if (!cleaned) {
      throw new Error(
        `Large-document transform returned an empty chunk (${index + 1}/${chunks.length}).`,
      )
    }
    transformed.push(cleaned)
    await onChunkComplete?.({
      index: index + 1,
      total: chunks.length,
      text: cleaned,
    })
  }
  return { text: transformed.join('\n\n'), chunkCount: chunks.length }
}
