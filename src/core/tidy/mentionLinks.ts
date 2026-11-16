import type { App } from 'obsidian'

import { stringifyUnknown } from '../../utils/stringifyUnknown'

import { splitFrontmatter } from './noteBlocks'

/** Ranges where a mention must not become a link. */
export function excludedRanges(content: string): [number, number][] {
  const ranges: [number, number][] = []
  const fm = splitFrontmatter(content)
  if (fm.hasFrontmatter) ranges.push([0, fm.bodyStart])
  const patterns = [
    /^(\s{0,3})(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\s{0,3}\2[^\n]*|$(?![\s\S]))/gm,
    /^#{1,6}\s[^\n]*$/gm,
    /`[^`\n]+`/g,
    /!?\[\[[^\]\n]*\]\]/g,
    /!?\[[^\]\n]*\]\([^)\n]*\)/g,
    /<[^>\n]+>/g,
    /%%[\s\S]*?%%/g,
    /\bhttps?:\/\/\S+/g,
    /(?:^|\s)#[^\s#]+/g,
  ]
  for (const pattern of patterns)
    for (const match of content.matchAll(pattern))
      ranges.push([match.index, match.index + match[0].length])
  return ranges
}

const WORD_CHAR = /[\p{L}\p{N}_]/u
const LATIN_OR_DIGIT = /[A-Za-z0-9_]/

/** Unlinked occurrences of `mention`, as [start, end) offsets. */
export function findMentions(content: string, mention: string): number[] {
  if (!mention.trim()) return []
  const ranges = excludedRanges(content)
  const result: number[] = []
  let from = 0
  for (;;) {
    const index = content.indexOf(mention, from)
    if (index === -1) break
    from = index + mention.length
    const end = index + mention.length
    if (ranges.some(([start, stop]) => index < stop && end > start)) continue
    const before = content[index - 1]
    if (before && WORD_CHAR.test(before)) continue
    const after = content[end]
    // Korean particles may follow a Hangul name; Latin words must end here.
    if (
      after &&
      LATIN_OR_DIGIT.test(mention[mention.length - 1]) &&
      LATIN_OR_DIGIT.test(after)
    )
      continue
    result.push(index)
  }
  return result
}

type LinkConfig = { useMarkdownLinks: boolean; newLinkFormat: string }

function linkConfig(app: App): LinkConfig {
  const vault = app.vault as App['vault'] & {
    getConfig?: (key: string) => unknown
  }
  return {
    useMarkdownLinks: vault.getConfig?.('useMarkdownLinks') === true,
    newLinkFormat: stringifyUnknown(
      vault.getConfig?.('newLinkFormat') ?? 'shortest',
    ),
  }
}

/**
 * Link text for `targetPath` written inside `sourcePath`. Existing files use
 * Obsidian's own generator, which follows the user's link settings; a note
 * that does not exist yet gets the same shape from the same settings.
 */
export function buildLink(
  app: App,
  targetPath: string,
  sourcePath: string,
  display: string,
): string {
  const basename = targetPath.split('/').pop()?.replace(/\.md$/i, '') ?? ''
  const alias = display !== basename ? display : undefined
  const file = app.vault.getFileByPath(targetPath)
  if (file && typeof app.fileManager?.generateMarkdownLink === 'function')
    return app.fileManager.generateMarkdownLink(
      file,
      sourcePath,
      undefined,
      alias,
    )
  const config = linkConfig(app)
  const withoutExtension = targetPath.replace(/\.md$/i, '')
  const ambiguous = app.vault
    .getMarkdownFiles()
    .some((other) => other.basename === basename && other.path !== targetPath)
  const linktext =
    config.newLinkFormat === 'absolute' || ambiguous
      ? withoutExtension
      : config.newLinkFormat === 'relative'
        ? relativePath(sourcePath, withoutExtension)
        : basename
  if (config.useMarkdownLinks) {
    const href = encodeURI(
      config.newLinkFormat === 'shortest' && !ambiguous
        ? `${basename}.md`
        : `${linktext}.md`,
    )
    return `[${display}](${href})`
  }
  return alias ? `[[${linktext}|${alias}]]` : `[[${linktext}]]`
}

function relativePath(from: string, to: string): string {
  const fromParts = from.split('/').slice(0, -1)
  const toParts = to.split('/')
  let common = 0
  while (
    common < fromParts.length &&
    common < toParts.length - 1 &&
    fromParts[common] === toParts[common]
  )
    common += 1
  return [
    ...fromParts.slice(common).map(() => '..'),
    ...toParts.slice(common),
  ].join('/')
}

/** Replace the chosen mention offsets with links, last first. */
export function linkMentions(
  content: string,
  offsets: number[],
  mention: string,
  link: (display: string) => string,
): string {
  let result = content
  for (const index of [...offsets].sort((a, b) => b - a))
    result =
      result.slice(0, index) +
      link(mention) +
      result.slice(index + mention.length)
  return result
}
