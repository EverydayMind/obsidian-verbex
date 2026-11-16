import { App } from 'obsidian'

import { L } from '../../i18n/modelText'
import { LoadedBatchSlice } from '../batch/foregroundBatchRunner'
import { treatyReviewText } from '../tools/treatyWiki'

import {
  TreatyBatchContextPacketBuilder,
  stripMarkdownFrontmatter,
} from './TreatyBatchContextPacketBuilder'

export class TreatySliceChangedError extends Error {
  constructor() {
    super(
      L({
        ko: '검토 중 조문 또는 보조 문맥이 변경되어 결과를 적용하지 않았습니다.',
        en: 'The article or supplementary context changed during review, so the result was not applied.',
      }),
    )
    this.name = 'TreatySliceChangedError'
  }
}

/** Compare the actual model-visible source, not just the mutable unit_hash field. */
export async function assertTreatySliceFresh(input: {
  app: App
  path: string | null
  wikiFolder: string
  builder: TreatyBatchContextPacketBuilder
  slice: LoadedBatchSlice
  signal?: AbortSignal
}): Promise<void> {
  input.signal?.throwIfAborted()
  if (!input.path || !(await input.app.vault.adapter.exists(input.path)))
    throw new TreatySliceChangedError()
  input.signal?.throwIfAborted()
  const markdown = await input.app.vault.adapter.read(input.path)
  if (treatyReviewText(stripMarkdownFrontmatter(markdown)) !== input.slice.body)
    throw new TreatySliceChangedError()
  input.signal?.throwIfAborted()
  const packet = await input.builder.buildTreatyBatchContextPacket(
    input.wikiFolder,
    markdown,
  )
  input.signal?.throwIfAborted()
  if (packet.text !== (input.slice.contextPacket ?? ''))
    throw new TreatySliceChangedError()
}
