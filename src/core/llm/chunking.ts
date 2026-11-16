import { estimateTokens } from '../../utils/llm/estimateTokens'
import { tokenCount } from '../../utils/llm/token'

/**
 * Token-aware document splitting (요구사항 2).
 *
 * Splits a large document into chunks that each fit within `maxTokens`, while
 * keeping natural boundaries intact wherever possible. The splitter works in
 * descending granularity so a chunk break lands on the strongest available
 * boundary that still fits:
 *
 *   markdown heading sections → blank-line paragraphs → lines → hard slice
 *
 * Token counting is the expensive part, so we measure incrementally per block
 * (not per character) and only fall back to a binary char-slice when a single
 * indivisible block is itself larger than the budget.
 */

type TokenCounter = (text: string) => Promise<number>

export type ChunkOptions = {
  maxTokens: number
  countTokens?: TokenCounter
}

const HEADING_RE = /^#{1,6}\s/

/**
 * Split `text` into ordered chunks, each within `maxTokens`. The concatenation
 * of all chunks (with single newlines rejoined) preserves the original content;
 * no text is dropped. Returns a single chunk when the whole document fits.
 */
export async function splitTextIntoChunks(
  text: string,
  { maxTokens, countTokens = tokenCount }: ChunkOptions,
): Promise<string[]> {
  if (maxTokens <= 0) {
    throw new Error('maxTokens must be positive')
  }
  if (!text.trim()) {
    return []
  }

  // Avoid tokenizing the whole document just to check whether it fits.
  // estimateTokens is the CJK-aware conservative estimate (Korean/Han counted at
  // 2.5 tokens/char), so a short-circuit here cannot silently leave a Korean
  // document — which cl100k expands well past one token per character — as a
  // single over-budget chunk. (The earlier char/2.5 heuristic under-counted CJK
  // by ~3-4x and could skip splitting a document that genuinely overflowed.)
  // When it exceeds the budget the document is split block-by-block below — and
  // the per-block counts already sum to the whole text — so a separate
  // full-document exact count would be redundant work on the large inputs we
  // want to avoid tokenizing.
  if (estimateTokens(text) <= maxTokens) {
    return [text]
  }

  // Build the boundary blocks: prefer heading sections, then paragraphs.
  const blocks = splitIntoBlocks(text)

  const chunks: string[] = []
  let buffer = ''
  let bufferTokens = 0

  const flush = () => {
    if (buffer.length > 0) {
      chunks.push(buffer)
      buffer = ''
      bufferTokens = 0
    }
  }

  for (const block of blocks) {
    const blockTokens = await countTokens(block)

    // A single block bigger than the budget must be hard-split on its own.
    if (blockTokens > maxTokens) {
      flush()
      for (const piece of await hardSplit(block, maxTokens, countTokens)) {
        chunks.push(piece)
      }
      continue
    }

    const separator = buffer.length > 0 ? '\n\n' : ''
    const separatorTokens = separator ? 1 : 0
    if (bufferTokens + separatorTokens + blockTokens > maxTokens) {
      flush()
      buffer = block
      bufferTokens = blockTokens
    } else {
      buffer += separator + block
      bufferTokens += separatorTokens + blockTokens
    }
  }
  flush()

  return chunks
}

/**
 * Break the document into blocks on heading boundaries first (each heading
 * starts a new block, carrying its body) and then on blank lines within a
 * section, so paragraphs stay together.
 */
function splitIntoBlocks(text: string): string[] {
  const lines = text.split('\n')
  const sections: string[] = []
  let current: string[] = []

  const pushCurrent = () => {
    if (current.length > 0) {
      sections.push(current.join('\n'))
      current = []
    }
  }

  for (const line of lines) {
    if (HEADING_RE.test(line) && current.length > 0) {
      pushCurrent()
    }
    current.push(line)
  }
  pushCurrent()

  // Within each section, split further on blank lines so a long heading-less
  // section still yields paragraph-sized blocks.
  const blocks: string[] = []
  for (const section of sections) {
    if (HEADING_RE.test(section.split('\n', 1)[0] ?? '')) {
      blocks.push(section)
      continue
    }
    for (const paragraph of section.split(/\n{2,}/)) {
      if (paragraph.trim()) {
        blocks.push(paragraph)
      }
    }
  }
  return blocks.filter((block) => block.trim().length > 0)
}

/**
 * Last-resort splitter for an indivisible block larger than the budget. Splits
 * on lines first; any single line still over budget is sliced by characters
 * using a token-ratio estimate, then verified.
 */
async function hardSplit(
  block: string,
  maxTokens: number,
  countTokens: TokenCounter,
): Promise<string[]> {
  const out: string[] = []
  let buffer = ''
  let bufferTokens = 0

  const lines = block.split('\n')
  for (const line of lines) {
    const lineTokens = await countTokens(line)
    if (lineTokens > maxTokens) {
      if (buffer) {
        out.push(buffer)
        buffer = ''
        bufferTokens = 0
      }
      for (const piece of await sliceByChars(line, maxTokens, countTokens)) {
        out.push(piece)
      }
      continue
    }
    const sep = buffer ? '\n' : ''
    if (bufferTokens + (sep ? 1 : 0) + lineTokens > maxTokens) {
      out.push(buffer)
      buffer = line
      bufferTokens = lineTokens
    } else {
      buffer += sep + line
      bufferTokens += (sep ? 1 : 0) + lineTokens
    }
  }
  if (buffer) {
    out.push(buffer)
  }
  return out
}

async function sliceByChars(
  text: string,
  maxTokens: number,
  countTokens: TokenCounter,
): Promise<string[]> {
  const out: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    const tokens = await countTokens(remaining)
    if (tokens <= maxTokens) {
      out.push(remaining)
      break
    }
    // Estimate a cut point from the token ratio, then shrink until it fits.
    let cut = Math.max(1, Math.floor((remaining.length * maxTokens) / tokens))
    let piece = remaining.slice(0, cut)
    while ((await countTokens(piece)) > maxTokens && cut > 1) {
      cut = Math.floor(cut * 0.9)
      piece = remaining.slice(0, cut)
    }
    out.push(piece)
    remaining = remaining.slice(piece.length)
  }
  return out
}
