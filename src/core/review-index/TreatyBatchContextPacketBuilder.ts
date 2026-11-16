import { App, normalizePath } from 'obsidian'

import type { ModelLocale } from '../../i18n/modelLocale'
import { noteFormat } from '../../i18n/noteFormats'
import { assertUserVaultPath } from '../../security/vaultPathPolicy'
import { estimateTokens } from '../../utils/llm/estimateTokens'
import { ContextPacketBlock, buildContextPacket } from '../batch/contextPacket'
import {
  PackedReviewMember,
  batchOutputContract,
  batchPackOutputContract,
} from '../tools/findingMarkdown'
import { frontmatterValue } from '../tools/reviewIndexMetadata'

import { treatyPacketText } from './treatyPacketText'

export const TREATY_PACK_PACKET_RESERVE_TOKENS = 4_000
type TreatyPacketPart = {
  blocks: ContextPacketBlock[]
  omittedReferences: boolean
}

function boundedSource(body: string, limit: number): string {
  return body.length > limit
    ? `${body.slice(0, limit)}\n${treatyPacketText().sourceOmitted}`
    : body
}

function boundedTreatyPacket(parts: TreatyPacketPart[]) {
  const blocks = parts.map((part) => part.blocks)
  const separatorTokens = Math.ceil(
    (blocks.reduce((count, member) => count + member.length, 0) + 2) / 2,
  )
  const notices = parts.some((part) => part.omittedReferences)
    ? [treatyPacketText().referencesOmitted]
    : []
  const build = () =>
    buildContextPacket({
      memberBlocks: blocks,
      tokenBudget: Math.max(
        0,
        TREATY_PACK_PACKET_RESERVE_TOKENS -
          estimateTokens(notices.join('\n')) -
          separatorTokens,
      ),
    })
  let packet = build()
  if (packet.droppedBlocks) {
    notices.push(treatyPacketText().omitted)
    packet = build()
  }
  return {
    ...packet,
    text: [...notices, packet.text].filter(Boolean).join('\n\n'),
  }
}

export function stripMarkdownFrontmatter(markdown: string): string {
  return markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '').trim()
}

export function frontmatterWikiLinks(markdown: string, key: string): string[] {
  const frontmatter = /^---\s*\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? ''
  const lines = frontmatter.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`${key}:`))
  if (start < 0) return []
  const values: string[] = []
  const inline = lines[start].slice(key.length + 1)
  for (const match of inline.matchAll(/\[\[([^\]]+)\]\]/g))
    values.push(match[1])
  for (let index = start + 1; index < lines.length; index += 1) {
    if (!/^\s+-\s+/.test(lines[index])) break
    for (const match of lines[index].matchAll(/\[\[([^\]]+)\]\]/g))
      values.push(match[1])
  }
  return [...new Set(values)]
}

// Misjudgment guard (§3.6-8): a reference the slice cannot see is not a
// defect. This rule applies to single-unit and packed slices alike — packing
// only removes intra-chapter blind spots, never cross-chapter ones.
export function treatyCrossCheckRules(locale?: ModelLocale): string[] {
  return treatyPacketText(locale).crossChecks
}

/**
 * Builds the context packet (document map, referenced terms/units, parent
 * chapter) and adapts the review prompt for treaty-wiki batch/pack review
 * slices. Extracted from ReviewIndexCoordinator (B1) — depends only on the
 * Obsidian App vault, not on run/ledger state.
 */
export class TreatyBatchContextPacketBuilder {
  constructor(private app: App) {}

  async buildTreatyBatchContextPacket(
    wikiFolder: string,
    unitMarkdown: string,
  ): Promise<{ text: string; packetDeps: string[] }> {
    const part = await this.buildTreatyBatchContextPacketBlocks(
      wikiFolder,
      unitMarkdown,
    )
    const packet = boundedTreatyPacket([part])
    return { text: packet.text, packetDeps: packet.packetDeps }
  }

  /**
   * Merged packet for a packed slice (§3.6-9): the union of every member's
   * blocks with exact-duplicate removal, so the shared document map and terms
   * cited by several members appear once.
   */
  async buildTreatyPackContextPacket(
    wikiFolder: string,
    unitMarkdowns: string[],
  ): Promise<string> {
    const memberBlocks: TreatyPacketPart[] = []
    for (const markdown of unitMarkdowns) {
      memberBlocks.push(
        await this.buildTreatyBatchContextPacketBlocks(wikiFolder, markdown),
      )
    }
    return boundedTreatyPacket(memberBlocks).text
  }

  private async buildTreatyBatchContextPacketBlocks(
    wikiFolder: string,
    unitMarkdown: string,
  ): Promise<TreatyPacketPart> {
    const reviewRoot = assertUserVaultPath(this.app, wikiFolder)
    const blocks: ContextPacketBlock[] = []
    let omittedReferences = false
    const indexPath = normalizePath(`${reviewRoot}/_index.md`)
    if (await this.app.vault.adapter.exists(indexPath)) {
      const index = await this.app.vault.adapter.read(indexPath)
      blocks.push({
        id: indexPath,
        priority: 0,
        text: `## ${treatyPacketText().map}\n${boundedSource(stripMarkdownFrontmatter(index), 4_000)}`,
      })
    }

    const readLinked = async (
      heading: string,
      targets: string[],
      defaultFolder: 'units' | 'terms',
      limit: number,
      charLimit: number,
    ) => {
      const sections: { id: string; text: string }[] = []
      const selectedTargets = targets.slice(0, limit)
      const safeTargets = selectedTargets.flatMap((raw) => {
        const target = raw
          .split('|', 1)[0]
          .split('#', 1)[0]
          .replace(/\.md$/i, '')
        const name = target.startsWith(`${defaultFolder}/`)
          ? target.slice(defaultFolder.length + 1)
          : target
        // Generated links are bare names or a single units/terms prefix.
        // Never let source-supplied links select a different folder or escape.
        if (
          !name ||
          name.startsWith('.') ||
          /[/\\]/.test(name) ||
          [...name].some((character) => {
            const code = character.charCodeAt(0)
            return code < 32 || code === 127
          })
        )
          return []
        const path = assertUserVaultPath(
          this.app,
          `${reviewRoot}/${defaultFolder}/${name}.md`,
        )
        return [{ raw, path }]
      })
      if (
        safeTargets.length !== selectedTargets.length ||
        targets.length > limit
      )
        omittedReferences = true
      for (const { raw, path } of safeTargets) {
        if (!(await this.app.vault.adapter.exists(path))) {
          omittedReferences = true
          continue
        }
        const body = stripMarkdownFrontmatter(
          await this.app.vault.adapter.read(path),
        )
        sections.push({
          id: path,
          text: `### ${raw}\n${boundedSource(body, charLimit)}`,
        })
      }
      for (const section of sections) {
        blocks.push({
          id: section.id,
          priority: defaultFolder === 'terms' ? 1 : 2,
          text: `## ${heading}\n${section.text}`,
        })
      }
    }

    await readLinked(
      treatyPacketText().terms,
      frontmatterWikiLinks(unitMarkdown, 'terms'),
      'terms',
      8,
      700,
    )
    await readLinked(
      treatyPacketText().references,
      frontmatterWikiLinks(unitMarkdown, 'refs'),
      'units',
      5,
      1_200,
    )

    const order = frontmatterValue(unitMarkdown, 'order')
    if (order && !order.endsWith('-00')) {
      const chapterKey = `${order.split('-', 1)[0]}-00`
      const parent = this.app.vault
        .getMarkdownFiles()
        .find((file) =>
          file.path.startsWith(`${reviewRoot}/units/${chapterKey} `),
        )
      if (parent) {
        const body = stripMarkdownFrontmatter(
          await this.app.vault.cachedRead(parent),
        )
        blocks.push({
          id: parent.path,
          priority: 3,
          text: `## ${treatyPacketText().parent}\n${boundedSource(body, 1_500)}`,
        })
      }
    }
    return { blocks, omittedReferences }
  }

  private adaptTreatyBatchPromptCore(
    prompt: string,
    scopeLabel: string,
    contract = batchOutputContract(),
  ) {
    const adapted = prompt
      .replace(/\[\[(?:대상 unit|target unit)\]\]/gi, scopeLabel)
      .replace(
        /(?:핵심 인용\s*\(30자 이내\)|Key quote\s*\(up to 30 characters\))/gi,
        noteFormat('evidence'),
      )
      .replace(/핵심 인용|Key quote/gi, noteFormat('evidence'))
      .replace(
        /^\*\*(?:의미있는 발견이 없으면|If there are no meaningful findings).*$/im,
        treatyPacketText().noRows,
      )
      .trim()
    return [contract, '', adapted].filter(Boolean).join('\n')
  }

  adaptTreatyBatchPrompt(prompt: string, unitTarget: string): string {
    return [
      this.adaptTreatyBatchPromptCore(
        prompt,
        `[[${unitTarget.replace(/\.md$/i, '')}]]`,
      ),
      '',
      treatyPacketText().rules,
      treatyPacketText().evidence,
      treatyPacketText().noCopy,
      treatyPacketText().context,
      ...treatyCrossCheckRules(),
    ].join('\n')
  }

  adaptTreatyPackPrompt(prompt: string, members: PackedReviewMember[]): string {
    return [
      this.adaptTreatyBatchPromptCore(
        prompt,
        treatyPacketText().articles,
        batchPackOutputContract(),
      ),
      '',
      treatyPacketText().rules,
      treatyPacketText().packEvidence,
      treatyPacketText().noCopy,
      treatyPacketText().context,
      ...treatyCrossCheckRules(),
      '',
      treatyPacketText().status,
      treatyPacketText().statusAdvice,
      noteFormat('reviewStatus'),
      ...members.map(
        (member) => `- ${member.unitId}: ${treatyPacketText().statusValue}`,
      ),
    ].join('\n')
  }
}
