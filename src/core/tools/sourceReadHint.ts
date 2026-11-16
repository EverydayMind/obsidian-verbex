import type { NativeProviderStatus } from '../../provider/interop/hostScanTypes'
import { nativeToolName } from '../../provider/interop/protocol'
import { SourceTextReader } from '../rag/sourceTextReader'

import {
  READABLE_TEXT_EXTENSIONS,
  ReaderProvider,
  ToolExecutionContext,
} from './localToolCommon'
import { resolveReadablePathFile } from './readablePath'
import * as modelText from './sourceReadHintText'

export async function unsupportedTextRead(
  path: string,
  ctx: ToolExecutionContext,
): Promise<string | null> {
  const file = resolveReadablePathFile(path, ctx)
  if (!file || READABLE_TEXT_EXTENSIONS.includes(file.extension.toLowerCase()))
    return null
  return modelText.unsupported(
    file.path,
    file.extension || modelText.none(),
    READABLE_TEXT_EXTENSIONS.join('/'),
    await sourceReadHint(file.path, ctx),
  )
}

/** Read-effect tools a provider descriptor declares, by native tool name. */
export function readerProviders(
  statuses: readonly NativeProviderStatus[] | undefined,
): ReaderProvider[] | undefined {
  return statuses?.map(({ providerId, state, descriptor }) => ({
    providerId,
    state,
    readTools: (descriptor?.tools ?? [])
      .filter((tool) => tool.effect === 'read')
      .map((tool) => ({
        name: nativeToolName(providerId, tool.name),
        resourceTypes: tool.resourceTypes,
      })),
  }))
}

/** Hints describe only readers actually exposed in this turn; never dispatch. */
export async function sourceReadHint(
  path: string,
  ctx: ToolExecutionContext,
): Promise<string> {
  const extension = path.split('.').pop()?.toLowerCase()
  if (extension && READABLE_TEXT_EXTENSIONS.includes(extension))
    return 'note_outline/read_note_section/read_note_lines'
  const status = await new SourceTextReader(ctx.app).inspectDocument(path)
  if (status.state === 'ready')
    return `note_outline/search_in_file/read_note_lines (disk_projection, version=${status.version})`
  // Descriptors spell types as ".pdf" or "pdf"; match either, never by id.
  const accepts = (types: readonly string[]) =>
    types.some((type) => type.replace(/^\./, '').toLowerCase() === extension)
  const providers = (ctx.readerProviders ?? [])
    .map((provider) => ({
      ...provider,
      readTools: provider.readTools.filter((tool) =>
        accepts(tool.resourceTypes),
      ),
    }))
    .filter((provider) => provider.readTools.length > 0)
  const exposed = new Set(ctx.exposedToolNames ?? [])
  const readers = providers
    .flatMap((provider) => provider.readTools.map((tool) => tool.name))
    .filter((name) => exposed.has(name))
    // Stable: tools named read_* first, then descriptor order.
    .sort(
      (a, b) => Number(!a.includes('__read_')) - Number(!b.includes('__read_')),
    )
    .slice(0, 3)
  const states = providers
    .filter((provider) => !provider.readTools.some((t) => exposed.has(t.name)))
    .map(
      ({ providerId, state }) =>
        `${providerId}:${state === 'active' ? 'not_exposed_this_turn' : state}`,
    )
    .join(',')
  return `source_state=${status.state}; ${readers.length ? `available_reader=${readers.join('/')}` : modelText.noReader(states || 'reader_installation_or_activation_unconfirmed')}${status.state === 'needs_ocr' ? modelText.ocr() : ''}`
}
