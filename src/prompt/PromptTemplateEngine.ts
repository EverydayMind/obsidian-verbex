/**
 * Mustache-style template engine for Verbex step prompts.
 *
 * Workflow step `prompt_template` files reference built-in variables that are
 * filled from the run's context (current request, search results, wiki, linked
 * notes, previous step output, skill instructions, etc.). The engine keeps a
 * small, dependency-free subset of Mustache:
 *
 * - `{{ name }}`            variable interpolation (dot-paths supported)
 * - `{{ steps.collect.output }}`  nested lookup into prior step artifacts
 * - `{{# name }}...{{/ name }}`   section, rendered when the value is truthy
 * - `{{^ name }}...{{/ name }}`   inverted section, rendered when falsy
 * - `{{! comment }}`        comment, stripped from output
 *
 * Values are inserted verbatim (no HTML escaping) because prompts are Markdown
 * sent to an LLM, not HTML. Missing variables render as an empty string and are
 * reported in `missing` so the caller can warn / trace.
 */

export type StepOutput = {
  output?: string
  [key: string]: unknown
}

export type PromptVariables = {
  user_request?: string
  mentioned_notes?: string
  wiki?: string
  search_results?: string
  linked_notes?: string
  dataview_results?: string
  base_results?: string
  excluded_context?: string
  prev_step_output?: string
  skill_instructions?: string
  steps?: Record<string, StepOutput>
  [key: string]: unknown
}

export type RenderResult = {
  output: string
  /** Variable paths referenced by the template. */
  used: string[]
  /** Referenced paths that resolved to undefined / null. */
  missing: string[]
}

type TextNode = { kind: 'text'; value: string }
type VarNode = { kind: 'var'; path: string }
type SectionNode = {
  kind: 'section'
  path: string
  inverted: boolean
  children: Node[]
}
type Node = TextNode | VarNode | SectionNode

const TAG = /\{\{([#^/!]?)\s*([^}]*?)\s*\}\}/g

function parse(template: string): Node[] {
  const root: Node[] = []
  // Stack of open sections; we always append to the top frame's children.
  const stack: { node: SectionNode | null; children: Node[] }[] = [
    { node: null, children: root },
  ]
  let lastIndex = 0
  let match: RegExpExecArray | null

  TAG.lastIndex = 0
  while ((match = TAG.exec(template)) !== null) {
    const [raw, sigil, body] = match
    const top = stack[stack.length - 1]
    if (match.index > lastIndex) {
      top.children.push({
        kind: 'text',
        value: template.slice(lastIndex, match.index),
      })
    }
    lastIndex = match.index + raw.length

    if (sigil === '!') {
      // comment — drop
      continue
    }
    if (sigil === '#' || sigil === '^') {
      const node: SectionNode = {
        kind: 'section',
        path: body,
        inverted: sigil === '^',
        children: [],
      }
      top.children.push(node)
      stack.push({ node, children: node.children })
      continue
    }
    if (sigil === '/') {
      const current = stack[stack.length - 1]
      if (!current.node || current.node.path !== body) {
        throw new Error(
          `Unbalanced section tag {{/${body}}} in prompt template`,
        )
      }
      stack.pop()
      continue
    }
    // plain variable
    top.children.push({ kind: 'var', path: body })
  }

  if (lastIndex < template.length) {
    stack[stack.length - 1].children.push({
      kind: 'text',
      value: template.slice(lastIndex),
    })
  }

  if (stack.length !== 1) {
    const unclosed = stack[stack.length - 1].node?.path ?? '(unknown)'
    throw new Error(`Unclosed section {{#${unclosed}}} in prompt template`)
  }
  return root
}

function resolve(path: string, scopes: unknown[]): unknown {
  const segments = path.split('.').map((s) => s.trim())
  // Walk scopes from innermost to outermost so section contexts shadow.
  for (let i = scopes.length - 1; i >= 0; i -= 1) {
    let value: unknown = scopes[i]
    let ok = true
    for (const segment of segments) {
      if (value && typeof value === 'object' && segment in value) {
        value = (value as Record<string, unknown>)[segment]
      } else {
        ok = false
        break
      }
    }
    if (ok) {
      return value
    }
  }
  return undefined
}

function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return value !== 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

export class PromptTemplateEngine {
  render(template: string, variables: PromptVariables = {}): RenderResult {
    const nodes = parse(template)
    const used: string[] = []
    const missing: string[] = []
    const scopes: unknown[] = [variables]

    const track = (path: string, value: unknown) => {
      if (!used.includes(path)) used.push(path)
      if ((value === undefined || value === null) && !missing.includes(path)) {
        missing.push(path)
      }
    }

    const renderNodes = (list: Node[]): string => {
      let out = ''
      for (const node of list) {
        if (node.kind === 'text') {
          out += node.value
        } else if (node.kind === 'var') {
          const value = resolve(node.path, scopes)
          track(node.path, value)
          out += stringify(value)
        } else {
          const value = resolve(node.path, scopes)
          track(node.path, value)
          const truthy = isTruthy(value)
          if (node.inverted) {
            if (!truthy) out += renderNodes(node.children)
          } else if (truthy) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              scopes.push(value)
              out += renderNodes(node.children)
              scopes.pop()
            } else {
              out += renderNodes(node.children)
            }
          }
        }
      }
      return out
    }

    const output = renderNodes(nodes)
    return { output, used, missing }
  }

  /** Variable paths referenced by a template, without rendering. */
  extractVariables(template: string): string[] {
    const paths = new Set<string>()
    const collect = (nodes: Node[]) => {
      for (const node of nodes) {
        if (node.kind === 'var') paths.add(node.path)
        if (node.kind === 'section') {
          paths.add(node.path)
          collect(node.children)
        }
      }
    }
    collect(parse(template))
    return [...paths]
  }
}
