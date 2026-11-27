import { normalizePath } from 'obsidian'

import { isBinaryDocumentPath } from '../../context/agentSourcePolicy'
import { L } from '../../i18n/modelText'
import { ToolCallRequest } from '../../types/tool-call.types'

import { parseToolArgs } from './parseToolArgs'

function affectedToolPaths(call: ToolCallRequest): string[] {
  const args = parseToolArgs(call.arguments)
  switch (call.name) {
    case 'write_file':
    case 'update_file':
    case 'transform_large_file':
    case 'replace_in_file':
    case 'delete_file': {
      const path = typeof args.path === 'string' ? args.path : null
      return path ? [path] : []
    }
    case 'rename_file':
    case 'move_file': {
      const paths = []
      if (typeof args.path === 'string') paths.push(args.path)
      if (typeof args.new_path === 'string') paths.push(args.new_path)
      return paths
    }
    case 'extract_to_file': {
      // The created note is the write target; the source is only read.
      return typeof args.new_path === 'string' ? [args.new_path] : []
    }
    case 'split_file_by_chapters':
      return typeof args.output_folder === 'string' ? [args.output_folder] : []
    default:
      return []
  }
}

const TEXT_CONTENT_WRITERS = new Set([
  'write_file',
  'update_file',
  'replace_in_file',
  'transform_large_file',
])

/**
 * Note write tools put text into a file. On a binary document that would
 * destroy it, so the call is refused.
 */
export function binaryDocumentWriteError(call: ToolCallRequest): string | null {
  if (!TEXT_CONTENT_WRITERS.has(call.name)) return null
  const path = affectedToolPaths(call).find(isBinaryDocumentPath)
  if (!path) return null
  return L({
    ko: `(오류: ${path}은(는) 바이너리 문서라 ${call.name}(으)로 내용을 쓸 수 없습니다.)`,
    en: `(Error: ${path} is a binary document; ${call.name} cannot write its contents.)`,
  })
}

export function hasBatchPathConflict(calls: ToolCallRequest[]): boolean {
  const seen = new Set<string>()
  for (const call of calls) {
    // This tool performs its own multi-step LLM transform before producing a
    // single Diff, so it must not enter the generic parallel LocalTool batch.
    if (
      call.name === 'transform_large_file' ||
      call.name === 'split_file_by_chapters' ||
      call.name === 'build_treaty_wiki' ||
      call.name === 'build_review_index' ||
      call.name === 'submit_wiki_finding' ||
      call.name === 'submit_finding' ||
      call.name === 'verify_wiki_links' ||
      call.name === 'audit_index' ||
      call.name === 'compile_wiki_report' ||
      call.name === 'compile_report' ||
      call.name === 'checklist_next'
    )
      return true
    for (const path of affectedToolPaths(call)) {
      const normalized = normalizePath(path)
      if (seen.has(normalized)) return true
      seen.add(normalized)
    }
  }
  return false
}
