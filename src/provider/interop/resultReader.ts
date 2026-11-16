import { RESULT_LIMITS, copyJson } from './descriptorReader'
import { MAX_RESULT_CHARS } from './descriptorSchema'
import {
  JsonObject,
  JsonValue,
  META_ERROR,
  META_EVIDENCE_PATHS,
  META_RESOURCE,
  ToolDescriptor,
} from './protocol'
import { readProgress } from './readProgress'
import {
  resultError,
  truncatedResult,
  unsupportedResultField,
} from './resultReaderText'

export const DEFAULT_RESULT_CHARS = 8000

export type NativeToolResult = {
  text: string
  isError: boolean
  retryable: boolean
  truncated: boolean
  errorCode?: string
  paths: string[]
  /** Safe copy of the host-only `_meta`. Never sent to the model. */
  meta: JsonObject
  readPage?: { text: string; continuation: string }
  documentRead?: import('../../core/large-document/documentReadProgress').DocumentReadFact
  readProgressInvalid?: boolean
}

const isRecord = (value: unknown): value is JsonObject =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * Reads a provider result: the text subset of MCP CallToolResult. The model
 * sees content + structuredContent only. Status comes from the typed `_meta`
 * fields and `isError`, never from the wording of the text.
 */
export function readToolResult(
  raw: unknown,
  tool: ToolDescriptor,
  vaultPath: (path: string) => string = (path) => path,
): NativeToolResult {
  const result = copyJson(raw, RESULT_LIMITS)
  if (!isRecord(result)) throw new Error(resultError('object'))
  for (const key of Object.keys(result))
    if (!['content', 'structuredContent', 'isError', '_meta'].includes(key))
      throw new Error(unsupportedResultField(key))
  const content = result.content
  if (!Array.isArray(content)) throw new Error(resultError('content'))
  const parts: string[] = []
  for (const item of content) {
    if (
      !isRecord(item) ||
      item.type !== 'text' ||
      typeof item.text !== 'string'
    )
      throw new Error(resultError('text'))
    parts.push(item.text)
  }
  if (result.isError !== undefined && typeof result.isError !== 'boolean')
    throw new Error(resultError('boolean'))
  if (
    result.structuredContent !== undefined &&
    !isRecord(result.structuredContent)
  )
    throw new Error(resultError('structured'))
  const meta = result._meta ?? {}
  if (!isRecord(meta)) throw new Error(resultError('meta'))
  const paths: string[] = []
  const addPath = (value: JsonValue | undefined) => {
    if (typeof value !== 'string') throw new Error(resultError('path'))
    paths.push(vaultPath(value))
  }
  const resource = meta[META_RESOURCE]
  if (resource !== undefined) {
    if (!isRecord(resource)) throw new Error(resultError('resource'))
    addPath(resource.path)
  }
  const evidence = meta[META_EVIDENCE_PATHS]
  if (evidence !== undefined) {
    if (!Array.isArray(evidence) || evidence.length > 256)
      throw new Error(resultError('evidence'))
    evidence.forEach(addPath)
  }
  const error = meta[META_ERROR]
  if (error !== undefined && !isRecord(error))
    throw new Error(resultError('error'))
  const body = parts.join('\n')
  if (result.structuredContent)
    parts.push(JSON.stringify(result.structuredContent))
  const limit = Math.min(
    tool.maxResultChars ?? DEFAULT_RESULT_CHARS,
    MAX_RESULT_CHARS,
  )
  const full = parts.join('\n')
  const truncated = full.length > limit
  const progress =
    tool.effect === 'read'
      ? readProgress(meta, paths, !truncated && !result.isError)
      : undefined
  return {
    documentRead: progress?.fact,
    readProgressInvalid: progress?.invalid,
    text: truncated ? truncatedResult(full, limit) : full,
    isError: result.isError,
    retryable: isRecord(error) && error.retryable === true,
    truncated,
    errorCode:
      isRecord(error) && typeof error.code === 'string'
        ? error.code
        : undefined,
    paths: [...new Set(paths)],
    meta,
    readPage:
      !truncated && tool.effect === 'read'
        ? {
            text: body,
            continuation: result.structuredContent
              ? JSON.stringify(result.structuredContent)
              : '',
          }
        : undefined,
  }
}
