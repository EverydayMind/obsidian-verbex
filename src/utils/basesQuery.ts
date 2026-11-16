import { App, TFile, getAllTags, parseYaml } from 'obsidian'

import { coerceString } from './coerceString'
import { propertyValueMatches } from './propertyLinks'

/**
 * Headless evaluator for Obsidian Base (.base) files.
 *
 * Obsidian's Bases query engine has no public/headless API and only renders
 * inside an open Bases view. To return *live* tables on demand we parse the
 * .base YAML and evaluate it against the vault metadata cache ourselves.
 *
 * Correctness over coverage: any filter construct we do not understand throws
 * UnsupportedBaseError so the caller can fall back to showing the raw
 * definition instead of a silently mis-filtered table.
 */
export class UnsupportedBaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedBaseError'
  }
}

type FilterNode =
  | string
  | FilterNode[]
  | {
      and?: FilterNode[]
      or?: FilterNode[]
      not?: FilterNode[]
    }

type BaseView = {
  type?: string
  name?: string
  filters?: FilterNode
  order?: string[]
  sort?: { property: string; direction?: string }[]
  limit?: number
}

type BaseFile = {
  filters?: FilterNode
  formulas?: Record<string, unknown>
  properties?: Record<string, { displayName?: string }>
  views?: BaseView[]
}

export type RenderBaseOptions = {
  /** Render only the named view, as Obsidian does for `![[file.base#View]]`. */
  view?: string
}

type EvalContext = {
  app?: App
  file: Pick<TFile, 'basename' | 'path' | 'extension' | 'stat'> & {
    parent: { path: string } | null
  }
  frontmatter: Record<string, unknown>
  tags: string[]
}

// --- value resolution -------------------------------------------------------

function resolveRef(ref: string, ctx: EvalContext): unknown {
  if (ref.startsWith('formula.')) {
    throw new UnsupportedBaseError(`formula reference not supported: ${ref}`)
  }
  if (ref.startsWith('file.')) {
    const key = ref.slice('file.'.length)
    switch (key) {
      case 'name':
      case 'basename':
        return ctx.file.basename
      case 'path':
        return ctx.file.path
      case 'folder':
        return ctx.file.parent?.path ?? ''
      case 'ext':
        return ctx.file.extension
      case 'tags':
        return ctx.tags
      case 'size':
        return ctx.file.stat.size
      case 'mtime':
        return ctx.file.stat.mtime
      case 'ctime':
        return ctx.file.stat.ctime
      default:
        throw new UnsupportedBaseError(`unsupported file property: ${ref}`)
    }
  }
  if (!/^(?:note\.)?[\p{L}\p{N}_-]+$/u.test(ref) || ref === 'this')
    throw new UnsupportedBaseError(`unsupported reference: ${ref}`)
  const key = ref.startsWith('note.') ? ref.slice('note.'.length) : ref
  return ctx.frontmatter[key]
}

function truthy(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.length > 0
  return Boolean(value)
}

function parseLiteral(raw: string): unknown {
  const s = raw.trim()
  const link = /^link\((.*)\)$/.exec(s)
  if (link) {
    const value = parseLiteral(link[1])
    if (typeof value !== 'string')
      throw new UnsupportedBaseError('link requires a string')
    return { link: value }
  }
  if (s.startsWith('"')) {
    try {
      const value: unknown = JSON.parse(s)
      if (typeof value === 'string') return value
    } catch {
      /* unsupported expression */
    }
    throw new UnsupportedBaseError(`unsupported literal: ${raw}`)
  }
  if (/^'(?:\\.|[^'\\])*'$/.test(s))
    return s.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\')
  if (s === 'true') return true
  if (s === 'false') return false
  if (s === 'null') return null
  if (s !== '' && !Number.isNaN(Number(s))) return Number(s)
  throw new UnsupportedBaseError(`unsupported literal: ${raw}`)
}

function looseEquals(a: unknown, b: unknown, ctx?: EvalContext): boolean {
  if (b && typeof b === 'object' && 'link' in b)
    return propertyValueMatches(a, b.link, ctx?.app, ctx?.file.path)
  if (a == null || b == null) return a == null && b == null
  if (Array.isArray(a)) return a.map(String).includes(coerceString(b))
  return coerceString(a) === coerceString(b)
}

function compare(
  left: unknown,
  op: string,
  right: unknown,
  ctx: EvalContext,
): boolean {
  switch (op) {
    case '==':
      return looseEquals(left, right, ctx)
    case '!=':
      return !looseEquals(left, right, ctx)
    default:
      break
  }
  // ordering operators
  const ln = typeof left === 'number' ? left : Number(left)
  const rn = typeof right === 'number' ? right : Number(right)
  const numeric = !Number.isNaN(ln) && !Number.isNaN(rn)
  const cmp = numeric
    ? ln - rn
    : coerceString(left ?? '').localeCompare(coerceString(right ?? ''))
  switch (op) {
    case '>':
      return cmp > 0
    case '<':
      return cmp < 0
    case '>=':
      return cmp >= 0
    case '<=':
      return cmp <= 0
    default:
      throw new UnsupportedBaseError(`unsupported operator: ${op}`)
  }
}

// --- expression parsing -----------------------------------------------------

/** Split an expression on a top-level operator (outside quotes/parens). */
function splitTopLevel(expr: string, op: string): string[] | null {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let last = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (quote) {
      if (c === quote && expr[i - 1] !== '\\') quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && expr.startsWith(op, i)) {
      parts.push(expr.slice(last, i))
      i += op.length - 1
      last = i + 1
    }
  }
  if (parts.length === 0) return null
  parts.push(expr.slice(last))
  return parts
}

const COMPARISON_OPS = ['==', '!=', '>=', '<=', '>', '<']

function matchComparison(
  expr: string,
): { left: string; op: string; right: string } | null {
  let depth = 0
  let quote: string | null = null
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (quote) {
      if (c === quote && expr[i - 1] !== '\\') quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0) {
      for (const op of COMPARISON_OPS) {
        if (expr.startsWith(op, i)) {
          return {
            left: expr.slice(0, i).trim(),
            op,
            right: expr.slice(i + op.length).trim(),
          }
        }
      }
    }
  }
  return null
}

const METHOD_RE = /^(.+)\.([A-Za-z]\w*)\((.*)\)$/

function evalLeaf(rawExpr: string, ctx: EvalContext): boolean {
  let expr = rawExpr.trim()
  if (expr === '') throw new UnsupportedBaseError('empty expression')

  // strip a fully-wrapping pair of parentheses
  while (expr.startsWith('(') && expr.endsWith(')')) {
    const inner = expr.slice(1, -1)
    if (splitTopLevel(inner, ')') == null) {
      expr = inner.trim()
    } else {
      break
    }
  }

  if (expr.startsWith('!') && expr[1] !== '=') {
    return !evalExpr(expr.slice(1), ctx)
  }

  const cmp = matchComparison(expr)
  if (cmp) {
    return compare(
      resolveRef(cmp.left, ctx),
      cmp.op,
      parseLiteral(cmp.right),
      ctx,
    )
  }

  const method = expr.match(METHOD_RE)
  if (method) {
    const [, object, name, argsRaw] = method
    const args =
      argsRaw.trim() === ''
        ? []
        : (splitTopLevel(argsRaw, ',') ?? [argsRaw]).map(parseLiteral)
    const arg = args[0]
    const multi = name === 'containsAny' || name === 'containsAll'
    if (
      (!multi && args.length !== (name === 'isEmpty' ? 0 : 1)) ||
      (multi && args.length === 0)
    )
      throw new UnsupportedBaseError(`invalid arguments: ${name}`)
    if (object === 'file') {
      switch (name) {
        case 'hasTag': {
          const want = String(arg).replace(/^#/, '')
          return ctx.tags.some((t) => t.replace(/^#/, '') === want)
        }
        case 'inFolder': {
          const folder = String(arg).replace(/\/$/, '')
          const parent = ctx.file.parent?.path ?? ''
          return parent === folder || ctx.file.path.startsWith(`${folder}/`)
        }
        case 'hasProperty':
          return String(arg) in ctx.frontmatter
        default:
          throw new UnsupportedBaseError(`unsupported file method: ${name}`)
      }
    }
    const value = resolveRef(object, ctx)
    // Obsidian: list.contains* compares elements, string.contains* is substring.
    const contains = (item: unknown): boolean =>
      Array.isArray(value) || (item && typeof item === 'object')
        ? looseEquals(value, item, ctx)
        : coerceString(value ?? '').includes(String(item))
    switch (name) {
      case 'containsAny':
        return args.some(contains)
      case 'containsAll':
        return args.every(contains)
      case 'contains':
        return contains(arg)
      case 'isEmpty':
        return !truthy(value)
      default:
        throw new UnsupportedBaseError(`unsupported method: ${object}.${name}`)
    }
  }

  // bare reference → truthy
  return truthy(resolveRef(expr, ctx))
}

function evalExpr(rawExpr: string, ctx: EvalContext): boolean {
  const expr = rawExpr.trim()
  const orParts = splitTopLevel(expr, '||')
  if (orParts) return orParts.some((p) => evalExpr(p, ctx))
  const andParts = splitTopLevel(expr, '&&')
  if (andParts) return andParts.every((p) => evalExpr(p, ctx))
  return evalLeaf(expr, ctx)
}

function evalFilterNode(node: FilterNode, ctx: EvalContext): boolean {
  if (typeof node === 'string') return evalExpr(node, ctx)
  // A bare YAML list is treated as an implicit AND of its conditions.
  if (Array.isArray(node)) return node.every((n) => evalFilterNode(n, ctx))
  if (node && typeof node === 'object') {
    if (Array.isArray(node.and)) {
      return node.and.every((n) => evalFilterNode(n, ctx))
    }
    if (Array.isArray(node.or)) {
      return node.or.some((n) => evalFilterNode(n, ctx))
    }
    if (Array.isArray(node.not)) {
      // every listed condition must be false
      return node.not.every((n) => !evalFilterNode(n, ctx))
    }
  }
  throw new UnsupportedBaseError('unsupported filter node')
}

// --- table rendering --------------------------------------------------------

function defaultDisplayName(ref: string): string {
  if (ref === 'file.name' || ref === 'file.basename') return 'File'
  if (ref.startsWith('file.')) return ref.slice('file.'.length)
  if (ref.startsWith('note.')) return ref.slice('note.'.length)
  if (ref.startsWith('formula.')) return ref.slice('formula.'.length)
  return ref
}

function displayValue(ref: string, ctx: EvalContext): string {
  let value: unknown
  try {
    value = resolveRef(ref, ctx)
  } catch (e) {
    if (e instanceof UnsupportedBaseError) return ''
    throw e
  }
  if (
    (ref === 'file.mtime' || ref === 'file.ctime') &&
    typeof value === 'number'
  ) {
    return new Date(value).toISOString()
  }
  if (value == null) return ''
  if (Array.isArray(value)) value = value.join(', ')
  return String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
}

function compareForSort(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return coerceString(a).localeCompare(coerceString(b))
}

// A synthetic context used to validate filter expressions up-front, so that an
// unsupported construct is detected (and the caller can fall back) regardless
// of how many files happen to match — filters are otherwise evaluated lazily
// per file, which would make detection depend on vault contents.
const PROBE_CONTEXT: EvalContext = {
  file: {
    basename: '',
    path: '',
    extension: '',
    parent: { path: '' },
    stat: { ctime: 0, mtime: 0, size: 0 },
  },
  frontmatter: {},
  tags: [],
}

function assertFilterSupported(filter: FilterNode): void {
  // Validate every branch, including branches hidden by boolean short circuits.
  if (Array.isArray(filter)) {
    filter.forEach(assertFilterSupported)
    return
  }
  if (filter && typeof filter === 'object') {
    for (const key of ['and', 'or', 'not'] as const) {
      if (Array.isArray(filter[key])) {
        filter[key].forEach(assertFilterSupported)
        return
      }
    }
  }
  if (typeof filter === 'string') {
    const parts = splitTopLevel(filter, '||') ?? splitTopLevel(filter, '&&')
    if (parts) {
      parts.forEach(assertFilterSupported)
      return
    }
  }
  evalFilterNode(filter, PROBE_CONTEXT)
}

function renderView(
  view: BaseView,
  baseFilter: FilterNode | undefined,
  contexts: EvalContext[],
  properties: Record<string, { displayName?: string }>,
): string {
  let entries = contexts
  if (baseFilter !== undefined) {
    assertFilterSupported(baseFilter)
    entries = entries.filter((ctx) => evalFilterNode(baseFilter, ctx))
  }
  const viewFilter = view.filters
  if (viewFilter !== undefined) {
    assertFilterSupported(viewFilter)
    entries = entries.filter((ctx) => evalFilterNode(viewFilter, ctx))
  }

  const sortKeys = view.sort
  if (Array.isArray(sortKeys) && sortKeys.length > 0) {
    entries = [...entries].sort((a, b) => {
      for (const s of sortKeys) {
        const dir = (s.direction ?? 'ASC').toUpperCase() === 'DESC' ? -1 : 1
        const cmp = compareForSort(
          resolveRefSafe(s.property, a),
          resolveRefSafe(s.property, b),
        )
        if (cmp !== 0) return cmp * dir
      }
      return 0
    })
  }

  if (typeof view.limit === 'number' && view.limit >= 0) {
    entries = entries.slice(0, view.limit)
  }

  const columns =
    Array.isArray(view.order) && view.order.length > 0
      ? view.order
      : ['file.name']
  const headers = columns.map(
    (c) => properties[c]?.displayName ?? defaultDisplayName(c),
  )

  const lines: string[] = []
  const viewName = view.name ?? view.type ?? 'view'
  lines.push(
    `### ${viewName} (${entries.length} ${entries.length === 1 ? 'entry' : 'entries'})`,
  )
  lines.push('')
  if (entries.length === 0) {
    lines.push('(No matching entries)')
    return lines.join('\n')
  }
  lines.push(`| ${headers.join(' | ')} |`)
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`)
  for (const ctx of entries) {
    lines.push(`| ${columns.map((c) => displayValue(c, ctx)).join(' | ')} |`)
  }
  return lines.join('\n')
}

function resolveRefSafe(ref: string, ctx: EvalContext): unknown {
  try {
    return resolveRef(ref, ctx)
  } catch {
    return null
  }
}

function buildContext(app: App, file: TFile): EvalContext {
  const cache = app.metadataCache.getFileCache(file)
  const frontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>
  const tags = cache ? (getAllTags(cache) ?? []) : []
  return { app, file, frontmatter, tags }
}

/**
 * Render a .base file into live markdown tables by evaluating its filters and
 * views against the current vault metadata. Throws UnsupportedBaseError if the
 * definition uses constructs this evaluator cannot evaluate exactly.
 */
export function renderBaseDefinition(
  app: App,
  rawYaml: string,
  options: RenderBaseOptions = {},
): string {
  let parsed: BaseFile
  try {
    parsed = (parseYaml(rawYaml) ?? {}) as BaseFile
  } catch (e) {
    throw new UnsupportedBaseError(
      `invalid base YAML: ${e instanceof Error ? e.message : String(e)}`,
    )
  }

  let views =
    Array.isArray(parsed.views) && parsed.views.length > 0
      ? parsed.views
      : [{ type: 'table' } as BaseView]

  const requestedView = options.view?.trim()
  if (requestedView) {
    views = views.filter(
      (view) =>
        typeof view.name === 'string' &&
        view.name.localeCompare(requestedView, undefined, {
          sensitivity: 'accent',
        }) === 0,
    )
    if (views.length === 0) {
      throw new UnsupportedBaseError(`view not found: ${requestedView}`)
    }
  }

  const contexts = app.vault
    .getMarkdownFiles()
    .map((file) => buildContext(app, file))

  const properties = parsed.properties ?? {}
  const sections = views.map((view) =>
    renderView(view, parsed.filters, contexts, properties),
  )
  return sections.join('\n\n')
}
