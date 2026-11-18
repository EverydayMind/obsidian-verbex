import { isMap, parseDocument } from 'yaml'

import { modelMarker } from '../../i18n/modelMarkers'
import { L } from '../../i18n/modelText'
import type { ChangeOutcome } from '../../workflow/StepExecutor'
import type { AgentToolOutcome } from '../llm/toolOutcome'

export function appendChangeText(
  base: AgentToolOutcome,
  outcome: ChangeOutcome,
  observation?: string,
): AgentToolOutcome {
  const text = [frontmatterRemovalFact(outcome), observation]
    .filter(Boolean)
    .join('\n')
  return text ? { ...base, displayText: `${base.displayText}\n${text}` } : base
}

const frontmatter = (text: string) =>
  /^\uFEFF?---[ \t]*\r?\n((?:[^\r\n]*\r?\n)*?)---[ \t]*(?:\r?\n|$)/.exec(
    text,
  )?.[1]

export function frontmatterRemovalFact(
  outcome: ChangeOutcome,
): string | undefined {
  if (
    !['applied', 'partially_applied'].includes(outcome.status) ||
    outcome.change.tool !== 'update_file' ||
    typeof outcome.change.before !== 'string' ||
    typeof outcome.appliedContent !== 'string'
  )
    return
  const previous = frontmatter(outcome.change.before)
  if (
    previous === undefined ||
    frontmatter(outcome.appliedContent) !== undefined
  )
    return
  let names: string[] | undefined
  try {
    const doc = parseDocument(previous, { uniqueKeys: true })
    if (!doc.errors.length && isMap(doc.contents))
      names = Object.keys(doc.toJS() as Record<string, unknown>)
  } catch {
    /* Report the block without properties when YAML cannot be read. */
  }
  if (!names)
    return L({
      ko: `${modelMarker('harnessFact', 'ko')} 이전 내용의 frontmatter가 새 내용에는 없습니다.`,
      en: `${modelMarker('harnessFact', 'en')} The previous content had frontmatter; the new content has none.`,
    })
  const list = names.slice(0, 8).join(', ')
  return L({
    ko: `${modelMarker('harnessFact', 'ko')} 이전 내용의 frontmatter(속성 ${names.length}개: ${list})가 새 내용에는 없습니다.`,
    en: `${modelMarker('harnessFact', 'en')} The previous content had frontmatter (${names.length} properties: ${list}); the new content has none.`,
  })
}
