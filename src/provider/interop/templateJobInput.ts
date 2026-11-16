import { inspectDecompositionPair } from './decompositionPair'
import { documentJobFileHash } from './documentJobFileHash'
import type { HostContext } from './editorActions'
import { markdownTemplateInput } from './markdownTemplateInput'

export async function readTemplateJobPair(
  host: HostContext,
  path: string,
  signal?: AbortSignal,
) {
  if (
    !host
      .getActiveDiscovered('md-to-hwpx')
      ?.descriptor?.tools.some((t) => t.name === 'get_derivation_report')
  )
    return null
  const markdown = /\.md$/i.test(path)
    ? await markdownTemplateInput(host, path)
    : undefined
  if (markdown === null || (!markdown && !/\.hwpx$/i.test(path))) return null
  const retiredInput = async () => ({
    retiredInput: { path, sha256: await documentJobFileHash(host, path) },
  })
  if (markdown?.retired && !markdown.templatePath) return retiredInput()
  let pair
  try {
    pair = await inspectDecompositionPair(
      host,
      host.vaultPath(markdown?.templatePath ?? path),
      signal,
    )
  } catch (error) {
    signal?.throwIfAborted()
    if (markdown?.retired) return retiredInput()
    throw error
  }
  if (!pair.record && !pair.recordRetired && !markdown?.retired) return null
  return { pair, supplied: markdown?.supplied }
}
