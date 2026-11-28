import { type App, type TFile, normalizePath } from 'obsidian'

import { t } from '../../i18n'
import { stringifyUnknown } from '../../utils/stringifyUnknown'
import type { CompositeChangeEntry } from '../../verbex/types'
import { toCrlf } from '../tools/appendFileContent'
import {
  type ToolArgs,
  type ToolExecutionContext,
  type ToolResult,
  changeHelper,
  str,
} from '../tools/localToolCommon'

import { buildLink, findMentions, linkMentions } from './mentionLinks'
import {
  type NoteBlock,
  blocksToDrop,
  compareBlocks,
  removeBlocks,
  splitBlocks,
  splitFrontmatter,
} from './noteBlocks'
import { noteComposer, noteComposerUnavailable } from './noteComposerPort'
import { sameFileName, sanitizeNoteTitle } from './noteTitle'
import { entityNoteContent, today } from './tidyEntityContent'
import type { TidyLedger } from './tidyLedger'
import * as text from './tidyLocalText'
import { tidyScan } from './tidyScan'
import {
  type Frontmatter,
  addAliases,
  aliasesOf,
  backlinkers,
  conflictingScalars,
  findEntityNote,
  folderOf,
  joinPath,
  nameTaken,
  previewInsert,
  readFrontmatter,
  referencedAnchors,
  vaultBasePath,
  withFrontmatter,
} from './tidyVault'

type Note = { file: TFile; content: string }

const error = (message: string): ToolResult => ({ kind: 'error', message })

async function readNote(app: App, path: string | null): Promise<Note | string> {
  if (!path) return 'A note path is required.'
  const normalized = normalizePath(path.trim())
  const file =
    app.vault.getFileByPath(normalized) ??
    app.vault.getFileByPath(`${normalized}.md`)
  if (!file || file.extension !== 'md')
    return `Markdown note not found: ${path}`
  return { file, content: await app.vault.read(file) }
}

function strings(args: ToolArgs, key: string): string[] {
  const value = args[key]
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === 'string' && !!item.trim(),
      )
    : []
}

function vaultConfig(app: App, key: string): unknown {
  return (
    app.vault as App['vault'] & { getConfig?: (k: string) => unknown }
  ).getConfig?.(key)
}

const short = (text: string, max = 60) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function context(
  content: string,
  start: number,
  end: number,
  replacement: string,
): string {
  const from = Math.max(0, start - 20)
  const to = Math.min(content.length, end + 20)
  return `"${short(content.slice(from, to), 80)}" → "${short(content.slice(from, start) + replacement + content.slice(end, to), 100)}"`
}

/** Folder for a new note, from Obsidian's "default location for new notes". */
function newNoteFolder(app: App, sourcePath: string, title: string): string {
  const parent = app.fileManager?.getNewFileParent?.(sourcePath, `${title}.md`)
  const path = parent?.path ?? folderOf(sourcePath)
  return path === '/' ? '' : path
}

function safeTitle(app: App, raw: string, folder: string) {
  return sanitizeNoteTitle(raw, { vaultBasePath: vaultBasePath(app), folder })
}

function titleNotes(result: {
  changed: boolean
  reasons: string[]
  displayTitle: string
  title: string
}): string[] {
  return result.changed
    ? [
        t('tidyR11.title', {
          display: result.displayTitle,
          title: result.title,
          reasons: result.reasons.join(', '),
        }),
      ]
    : []
}

export function linkUpdateNotes(
  app: App,
  linkers: { path: string; links: number }[],
): string[] {
  if (!linkers.length) return []
  const notes = [
    t('tidyR11.links', {
      count: linkers.length,
      notes: linkers
        .slice(0, 8)
        .map((item) => `${item.path}(${item.links})`)
        .join(', '),
      tail: linkers.length > 8 ? ' …' : '',
    }),
  ]
  if (vaultConfig(app, 'alwaysUpdateLinks') !== true)
    notes.push(t('tidyR11.updateLinks'))
  return notes
}

export async function linkerEntries(
  app: App,
  linkers: { path: string }[],
  skip: string[],
): Promise<CompositeChangeEntry[]> {
  const entries: CompositeChangeEntry[] = []
  for (const { path } of linkers) {
    if (skip.includes(path)) continue
    const file = app.vault.getFileByPath(path)
    if (!file) continue
    entries.push({ op: 'modify', path, before: await app.vault.read(file) })
  }
  return entries
}

function chooseMention(
  content: string,
  mention: string,
  occurrence: number,
): number | null {
  const offsets = findMentions(content, mention)
  return offsets[Math.max(1, Math.floor(occurrence)) - 1] ?? null
}

async function createEntityNote(app: App, args: ToolArgs): Promise<ToolResult> {
  const name = str(args, 'name')?.trim()
  const entityType = (str(args, 'entity_type') ?? 'concept').trim()
  if (!name) return error('create_entity_note requires "name".')
  const source = await readNote(app, str(args, 'source_path'))
  if (typeof source === 'string') return error(source)
  const mention = str(args, 'mention_text') ?? name
  const occurrence = typeof args.occurrence === 'number' ? args.occurrence : 1
  const offset = chooseMention(source.content, mention, occurrence)
  if (offset === null)
    return error(text.missingMention(mention, source.file.path))
  const aliases = strings(args, 'aliases')
  const sanitized = sanitizeNoteTitle(name)
  const existing = findEntityNote(app, [
    name,
    ...(sanitized.ok ? [sanitized.title] : []),
    ...aliases,
  ])
  if (existing?.path === source.file.path)
    return error(text.selfLink(source.file.path, name))
  if (existing) {
    const link = buildLink(app, existing.path, source.file.path, mention)
    const after = linkMentions(source.content, [offset], mention, () => link)
    return changeHelper('create_entity_note', {
      op: 'modify',
      kind: 'link',
      path: source.file.path,
      before: source.content,
      after,
      approvalMode: 'whole_change',
      approvalNotes: [
        t('tidyR11.existing', { name, path: existing.path }),
        context(source.content, offset, offset + mention.length, link),
      ],
    })
  }
  const draftFolder = newNoteFolder(app, source.file.path, name)
  const title = safeTitle(app, name, draftFolder)
  if (!title.ok) return error(title.reason)
  const taken = nameTaken(app, draftFolder, title.title)
  if (taken) return error(text.nameTakenText(taken, true))
  const newPath = joinPath(draftFolder, `${title.title}.md`)
  const allAliases = [...aliases]
  if (title.changed && !allAliases.includes(title.displayTitle))
    allAliases.push(title.displayTitle)
  if (
    mention !== title.title &&
    !allAliases.some((alias) => sameFileName(alias, mention))
  )
    allAliases.push(mention)
  const content = await entityNoteContent(app, {
    title: title.title,
    entityType,
    aliases: allAliases,
    summary: str(args, 'summary'),
    newPath,
    source,
  })
  const link = buildLink(app, newPath, source.file.path, mention)
  const sourceAfter = linkMentions(
    source.content,
    [offset],
    mention,
    () => link,
  )
  return changeHelper('create_entity_note', {
    op: 'create',
    kind: 'create',
    path: newPath,
    before: null,
    after: content,
    approvalMode: 'whole_change',
    approvalNotes: [
      t('tidyR11.create', {
        type: entityType,
        path: newPath,
        source: source.file.path,
        mention,
      }),
      t('tidyR11.original', {
        context: context(source.content, offset, offset + mention.length, link),
      }),
      ...titleNotes(title),
    ],
    composite: {
      operation: 'write_set',
      entries: [
        { op: 'create', path: newPath, before: null, after: content },
        {
          op: 'modify',
          path: source.file.path,
          before: source.content,
          after: sourceAfter,
        },
      ],
      params: {},
    },
  })
}

async function linkExistingMentions(
  app: App,
  args: ToolArgs,
): Promise<ToolResult> {
  const entity = await readNote(app, str(args, 'entity_path'))
  if (typeof entity === 'string') return error(entity)
  const source = await readNote(app, str(args, 'source_path'))
  if (typeof source === 'string') return error(source)
  if (entity.file.path === source.file.path)
    return error('An entity note does not link to itself.')
  const texts = strings(args, 'mention_texts')
  const surfaces = (
    texts.length
      ? texts
      : [entity.file.basename, ...aliasesOf(readFrontmatter(entity.content))]
  ).sort((a, b) => b.length - a.length)
  const hits: { start: number; text: string }[] = []
  for (const text of surfaces)
    for (const start of findMentions(source.content, text))
      if (
        !hits.some(
          (hit) =>
            start < hit.start + hit.text.length &&
            hit.start < start + text.length,
        )
      )
        hits.push({ start, text })
  hits.sort((a, b) => a.start - b.start)
  const chosen = args.mode === 'all' ? hits : hits.slice(0, 1)
  if (!chosen.length)
    return {
      kind: 'read',
      text: text.noMentions(source.file.path, entity.file.path, surfaces),
    }
  let after = source.content
  for (const hit of [...chosen].reverse())
    after = linkMentions(after, [hit.start], hit.text, (display) =>
      buildLink(app, entity.file.path, source.file.path, display),
    )
  return changeHelper('link_mentions', {
    op: 'modify',
    kind: 'link',
    path: source.file.path,
    before: source.content,
    after,
    approvalMode: 'whole_change',
    approvalNotes: [
      t('tidyR11.mentions', {
        source: source.file.path,
        count: chosen.length,
        entity: entity.file.path,
        first: args.mode === 'all' ? '' : t('tidyR11.first'),
      }),
    ],
  })
}

function anchorsIn(
  blocks: NoteBlock[],
  start: number,
  end: number,
): Set<string> {
  const anchors = new Set<string>()
  for (const block of blocks) {
    if (block.start < start || block.end > end) continue
    if (block.headingText) anchors.add(block.headingText)
    if (block.blockId) anchors.add(`^${block.blockId}`)
  }
  return anchors
}

function blockHasReferencedAnchor(
  block: NoteBlock,
  anchors: Set<string>,
): boolean {
  return (
    (!!block.blockId && anchors.has(`^${block.blockId}`)) ||
    (!!block.headingText && anchors.has(block.headingText))
  )
}

async function mergeNotes(app: App, args: ToolArgs): Promise<ToolResult> {
  const composer = noteComposer(app)
  if (!composer)
    return {
      kind: 'error',
      message: noteComposerUnavailable(),
      retryAllowed: false,
    }
  const source = await readNote(app, str(args, 'source_path'))
  if (typeof source === 'string') return error(source)
  const target = await readNote(app, str(args, 'target_path'))
  if (typeof target === 'string') return error(target)
  if (source.file.path === target.file.path)
    return error('Source and target must differ.')
  const position = args.position === 'prepend' ? 'prepend' : 'append'
  const anchors = referencedAnchors(app, source.file.path)
  const comparison = compareBlocks(source.content, target.content, anchors)
  const sourceBlocks = splitBlocks(source.content)
  const protectedIds = new Set(
    sourceBlocks
      .filter((block) => blockHasReferencedAnchor(block, anchors))
      .map((block) => block.id),
  )
  const exactIds =
    args.drop_duplicates === false
      ? []
      : comparison.identical.map((block) => block.id)
  const known = new Set(sourceBlocks.map((block) => block.id))
  const extra = strings(args, 'extra_drop_block_ids')
  const unknown = extra.filter((id) => !known.has(id))
  if (unknown.length)
    return error(
      `Unknown source block ids: ${unknown.join(', ')}. Run compare_notes again and use its ids.`,
    )
  const dropped = blocksToDrop(
    source.content,
    new Set([...exactIds, ...extra]),
    protectedIds,
  )
  const exactSet = new Set(exactIds)
  const droppedExact = dropped.filter(
    (block) => exactSet.has(block.id) || block.kind === 'heading',
  )
  const droppedExtra = dropped.filter(
    (block) => !exactSet.has(block.id) && block.kind !== 'heading',
  )
  const sourceData = readFrontmatter(source.content)
  const targetData = readFrontmatter(target.content)
  const conflicts = conflictingScalars(targetData, sourceData)
  const keepTarget = args.frontmatter_conflicts !== 'take_source'
  let stagedData: Frontmatter = Object.fromEntries(
    Object.entries(sourceData).filter(
      ([key]) => !keepTarget || !conflicts.includes(key),
    ),
  )
  if (!sameFileName(source.file.basename, target.file.basename))
    stagedData = addAliases(stagedData, [source.file.basename])
  const stagedBody = removeBlocks(source.content, dropped)
  const staged = withFrontmatter(stagedBody, stagedData)
  const inserted = composer.hasTemplate
    ? await composer.applyTemplate(
        staged,
        source.file.basename,
        target.file.basename,
      )
    : staged
  const targetAfter = previewInsert(target.content, inserted, position)
  const linkers = backlinkers(app, source.file.path)
  const trash = stringifyUnknown(vaultConfig(app, 'trashOption') ?? 'system')
  const notes = [
    t('tidyR11.merge', {
      source: source.file.path,
      target: target.file.path,
      position: t(
        position === 'prepend' ? 'tidyR11.prepend' : 'tidyR11.append',
      ),
      trash: t(
        trash === 'local'
          ? 'tidyR11.localTrash'
          : trash === 'none'
            ? 'tidyR11.permanent'
            : 'tidyR11.systemTrash',
      ),
    }),
    t('tidyR11.exact', {
      count: droppedExact.length,
      details: droppedExact.length
        ? `: ${droppedExact
            .slice(0, 5)
            .map((block) => `"${short(block.text, 40)}"`)
            .join(', ')}`
        : '',
    }),
    ...(droppedExtra.length
      ? [
          t('tidyR11.extra', {
            count: droppedExtra.length,
            blocks: droppedExtra
              .map((block) => `"${short(block.text, 40)}"`)
              .join(', '),
          }),
        ]
      : []),
    ...(comparison.protectedDuplicates.length
      ? [
          t('tidyR11.protected', {
            count: comparison.protectedDuplicates.length,
            anchors: comparison.protectedDuplicates
              .map((item) => item.anchor)
              .join(', '),
          }),
        ]
      : []),
    ...(conflicts.length
      ? [
          t('tidyR11.conflicts', {
            keys: conflicts.join(', '),
            action: t(keepTarget ? 'tidyR11.keepTarget' : 'tidyR11.takeSource'),
          }),
        ]
      : []),
    t('tidyR11.alias', { title: source.file.basename }),
    ...(composer.hasTemplate ? [t('tidyR11.template')] : []),
    t('tidyR11.properties'),
    ...linkUpdateNotes(app, linkers),
  ]
  const entries: CompositeChangeEntry[] = [
    {
      op: 'modify',
      path: target.file.path,
      before: target.content,
      after: targetAfter,
    },
    {
      op: 'delete',
      path: source.file.path,
      before: source.content,
      after: null,
    },
    ...(await linkerEntries(app, linkers, [
      source.file.path,
      target.file.path,
    ])),
  ]
  return changeHelper('merge_notes', {
    op: 'modify',
    kind: 'body',
    path: target.file.path,
    before: target.content,
    after: targetAfter,
    approvalMode: 'whole_change',
    approvalNotes: notes,
    composite: {
      operation: 'note_merge',
      entries,
      params: {
        sourcePath: source.file.path,
        targetPath: target.file.path,
        position,
        stagedSource: staged,
      },
    },
  })
}

function uniqueIndex(
  content: string,
  value: string,
  from = 0,
): { index: number; length: number } | string {
  let match = value
  let first = content.indexOf(match, from)
  if (first === -1 && content.includes('\r\n') && /(?<!\r)\n/.test(value)) {
    match = toCrlf(value)
    first = content.indexOf(match, from)
  }
  if (first === -1) return text.missingText(short(value, 40))
  if (content.includes(match, first + 1))
    return text.repeatedText(short(value, 40))
  return { index: first, length: match.length }
}

function splitRange(
  content: string,
  args: ToolArgs,
): [number, number] | string {
  const bodyStart = splitFrontmatter(content).bodyStart
  const heading = str(args, 'heading')?.trim()
  if (heading) {
    const blocks = splitBlocks(content)
    const matches = blocks.filter(
      (block) => block.headingText?.trim() === heading,
    )
    if (matches.length !== 1)
      return matches.length
        ? text.repeatedHeading(heading)
        : text.missingHeading(heading)
    const level = matches[0].headingLevel ?? 1
    const next = blocks.find(
      (block) =>
        block.start > matches[0].start &&
        block.kind === 'heading' &&
        (block.headingLevel ?? 1) <= level,
    )
    let end = next ? next.start : content.length
    while (end > matches[0].start && /\s/.test(content[end - 1])) end -= 1
    return [matches[0].start, end]
  }
  const startText = str(args, 'start_text')
  const endText = str(args, 'end_text')
  if (!startText || !endText)
    return 'split_note requires "heading" or both "start_text" and "end_text".'
  const start = uniqueIndex(content, startText)
  if (typeof start === 'string') return start
  if (start.index < bodyStart)
    return 'The range must start after the frontmatter.'
  const endStart = uniqueIndex(content, endText)
  if (typeof endStart === 'string') return endStart
  if (endStart.index < start.index)
    return 'end_text must come after start_text.'
  return [start.index, endStart.index + endStart.length]
}

async function splitNote(app: App, args: ToolArgs): Promise<ToolResult> {
  const composer = noteComposer(app)
  if (!composer)
    return {
      kind: 'error',
      message: noteComposerUnavailable(),
      retryAllowed: false,
    }
  const source = await readNote(app, str(args, 'source_path'))
  if (typeof source === 'string') return error(source)
  const range = splitRange(source.content, args)
  if (typeof range === 'string') return error(range)
  const [start, end] = range
  const rawTitle = str(args, 'new_title')
  if (!rawTitle) return error('split_note requires "new_title".')
  const folder = newNoteFolder(app, source.file.path, rawTitle)
  const title = safeTitle(app, rawTitle, folder)
  if (!title.ok) return error(title.reason)
  const taken = nameTaken(app, folder, title.title)
  if (taken) return error(text.nameTakenText(taken))
  const newPath = joinPath(folder, `${title.title}.md`)
  const data: Frontmatter = {
    type: (str(args, 'note_type') ?? 'task').trim(),
    ...(str(args, 'status') ? { status: str(args, 'status') } : {}),
    ...(title.changed ? { aliases: [title.displayTitle] } : {}),
    created: today(),
  }
  const newNoteContent = withFrontmatter('', data)
  const extracted = source.content.slice(start, end)
  const inserted = composer.hasTemplate
    ? await composer.applyTemplate(extracted, source.file.basename, title.title)
    : extracted
  const newAfter = previewInsert(newNoteContent, inserted, 'append')
  const link = buildLink(app, newPath, source.file.path, title.title)
  const replacement =
    composer.replacementText === 'none'
      ? ''
      : composer.replacementText === 'embed'
        ? `!${link}`
        : link
  const sourceAfter =
    source.content.slice(0, start) + replacement + source.content.slice(end)
  const anchors = anchorsIn(splitBlocks(source.content), start, end)
  const linkers = [...referencedAnchorsBy(app, source.file.path, anchors)]
  return changeHelper('split_note', {
    op: 'create',
    kind: 'create',
    path: newPath,
    before: null,
    after: newAfter,
    approvalMode: 'whole_change',
    approvalNotes: [
      t('tidyR11.split', {
        source: source.file.path,
        text: short(extracted, 50),
        path: newPath,
      }),
      t('tidyR11.replacement', {
        action:
          composer.replacementText === 'none'
            ? t('tidyR11.leaveNone')
            : t(
                composer.replacementText === 'embed'
                  ? 'tidyR11.leaveEmbed'
                  : 'tidyR11.leaveLink',
                { replacement },
              ),
      }),
      ...titleNotes(title),
      ...(composer.hasTemplate ? [t('tidyR11.template')] : []),
      ...linkUpdateNotes(
        app,
        linkers.map((path) => ({ path, links: 1 })),
      ),
    ],
    composite: {
      operation: 'note_extract',
      entries: [
        { op: 'create', path: newPath, before: null, after: newAfter },
        {
          op: 'modify',
          path: source.file.path,
          before: source.content,
          after: sourceAfter,
        },
        ...(await linkerEntries(
          app,
          linkers.map((path) => ({ path })),
          [source.file.path],
        )),
      ],
      params: {
        sourcePath: source.file.path,
        newPath,
        newNoteContent,
        start,
        end,
      },
    },
  })
}

/** Notes that link into `path` at one of `anchors` (heading or block id). */
function referencedAnchorsBy(
  app: App,
  path: string,
  anchors: Set<string>,
): Set<string> {
  const result = new Set<string>()
  if (!anchors.size) return result
  for (const { path: other } of backlinkers(app, path)) {
    const file = app.vault.getFileByPath(other)
    const cache = file ? app.metadataCache.getFileCache(file) : null
    for (const link of [...(cache?.links ?? []), ...(cache?.embeds ?? [])]) {
      const hash = link.link.indexOf('#')
      if (hash !== -1 && anchors.has(link.link.slice(hash + 1).trim()))
        result.add(other)
    }
  }
  return result
}

async function retitleNote(app: App, args: ToolArgs): Promise<ToolResult> {
  const note = await readNote(app, str(args, 'path'))
  if (typeof note === 'string') return error(note)
  const rawTitle = str(args, 'new_title')
  if (!rawTitle) return error('retitle_note requires "new_title".')
  const folder = folderOf(note.file.path)
  const title = safeTitle(app, rawTitle, folder)
  if (!title.ok) return error(title.reason)
  if (title.title === note.file.basename)
    return { kind: 'read', text: text.sameTitle() }
  if (sameFileName(title.title, note.file.basename))
    return error(text.caseOnlyRename())
  const taken = nameTaken(app, folder, title.title)
  if (taken) return error(text.nameTakenText(taken))
  const newPath = joinPath(folder, `${title.title}.md`)
  const keepAlias = args.keep_old_title_as_alias !== false
  const aliasNames = [
    ...(keepAlias ? [note.file.basename] : []),
    ...(title.changed ? [title.displayTitle] : []),
  ]
  const aliased = aliasNames.length
    ? withFrontmatter(
        note.content,
        addAliases(readFrontmatter(note.content), aliasNames),
      )
    : null
  const linkers = backlinkers(app, note.file.path)
  return changeHelper('retitle_note', {
    op: 'rename',
    kind: 'rename',
    path: newPath,
    originalPath: note.file.path,
    before: note.content,
    after: aliased ?? note.content,
    approvalMode: 'whole_change',
    approvalNotes: [
      t('tidyR11.rename', { old: note.file.basename, title: title.title }),
      ...(keepAlias
        ? [t('tidyR11.oldAlias', { title: note.file.basename })]
        : []),
      ...titleNotes(title),
      ...linkUpdateNotes(app, linkers),
    ],
    composite: {
      operation: 'note_rename',
      entries: [
        {
          op: 'rename',
          path: newPath,
          originalPath: note.file.path,
          before: note.content,
          after: aliased ?? note.content,
        },
        ...(await linkerEntries(app, linkers, [note.file.path])),
      ],
      params: { path: note.file.path, newPath, aliasedContent: aliased },
    },
  })
}

async function compareNotes(app: App, args: ToolArgs): Promise<ToolResult> {
  const a = await readNote(app, str(args, 'path'))
  if (typeof a === 'string') return error(a)
  const b = await readNote(app, str(args, 'other_path'))
  if (typeof b === 'string') return error(b)
  const result = compareBlocks(
    a.content,
    b.content,
    referencedAnchors(app, a.file.path),
  )
  const conflicts = conflictingScalars(
    readFrontmatter(b.content),
    readFrontmatter(a.content),
  )
  const headings = text.comparisonHeadings(
    result.identical.length,
    result.protectedDuplicates.length,
    result.onlyInSource.length,
    result.onlyInTarget.length,
  )
  const list = (blocks: NoteBlock[], max = 40) =>
    blocks
      .slice(0, max)
      .map((block) => `- ${block.id} [${block.kind}] ${short(block.text, 100)}`)
  return {
    kind: 'read',
    evidencePaths: [a.file.path, b.file.path],
    text: [
      text.comparisonHeader(a.file.path, b.file.path),
      text.comparisonLinks(
        backlinkers(app, a.file.path).length,
        backlinkers(app, b.file.path).length,
        conflicts,
      ),
      headings[0],
      ...list(result.identical),
      headings[1],
      ...result.protectedDuplicates.map(
        (item) => `- ${item.block.id} ${item.anchor}`,
      ),
      headings[2],
      ...list(result.onlyInSource),
      headings[3],
      ...list(result.onlyInTarget, 15).map((line) =>
        line.replace(/^- b\d+-\w+ /, '- '),
      ),
    ].join('\n'),
  }
}

async function run(
  app: App,
  tool: string,
  args: ToolArgs,
): Promise<ToolResult> {
  switch (tool) {
    case 'tidy_scan':
      return {
        kind: 'read',
        text: await tidyScan(app, {
          folder: str(args, 'folder') ?? undefined,
          paths: strings(args, 'paths'),
          limit: typeof args.limit === 'number' ? args.limit : undefined,
        }),
      }
    case 'compare_notes':
      return compareNotes(app, args)
    case 'merge_notes':
      return mergeNotes(app, args)
    case 'create_entity_note':
      return createEntityNote(app, args)
    case 'link_mentions':
      return linkExistingMentions(app, args)
    case 'split_note':
      return splitNote(app, args)
    case 'retitle_note':
      return retitleNote(app, args)
    default:
      return error(`Unknown note tidy tool: ${tool}`)
  }
}

export { TidyLedger } from './tidyLedger'
export { isTidyTool } from './tidyTools'

/**
 * A proposal the user already rejected in this run comes back as a fact, not
 * a second approval prompt, unless the user asked for it again explicitly.
 */
export async function executeTidyTool(
  tool: string,
  args: ToolArgs,
  ctx: Pick<ToolExecutionContext, 'app' | 'conversationId'>,
  ledger?: TidyLedger,
): Promise<ToolResult> {
  const result = await run(ctx.app, tool, args)
  if (result.kind !== 'change' || !ledger || !ctx.conversationId) return result
  if (args.retry_rejected === true) return result
  const reason = ledger.rejectedReason(ctx.conversationId, result.change)
  if (reason === null) return result
  return {
    kind: 'read',
    text: text.alreadyRejected(result.change.path, reason),
  }
}
