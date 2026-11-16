import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import { RequestMessage } from '../../types/llm/request'

/**
 * Pure helpers for inline editor writing (the "continue at cursor" and "rewrite
 * selection" commands). Kept provider- and Obsidian-free so the prompt assembly
 * and output sanitation are unit-testable; VerbexController wires these to
 * runChatStep and main.ts wires them to the editor.
 */

export type InlineWritingMode = 'continue' | 'rewrite'

export type InlineWritingInput = {
  mode: InlineWritingMode
  /** Text before the cursor (continue) or before the selection (rewrite). */
  precedingText: string
  /** Text after the cursor / selection, supplied as read-only context. */
  followingText?: string
  /** The selected span to rewrite. Required for rewrite, ignored for continue. */
  selection?: string
  /** User instruction (required for rewrite, optional steering for continue). */
  instruction?: string | null
  /** Vault-relative path of the note, used only to orient tone. */
  notePath?: string | null
}

// Char budgets keep the inline call cheap and reliable on small / local models.
// The context closest to the edit point matters most, so we keep the tail of the
// preceding text and the head of the following text / selection.
export const MAX_PRECEDING_CHARS = 6000
export const MAX_FOLLOWING_CHARS = 2000
export const MAX_SELECTION_CHARS = 8000

/** Keeps the last `max` chars (the part nearest the cursor), marking the cut. */
export function clampToTail(text: string, max: number): string {
  if (text.length <= max) return text
  return `…${text.slice(text.length - max)}`
}

/** Keeps the first `max` chars, marking the cut. */
export function clampToHead(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function continueSystem(locale?: ModelLocale): string {
  return L(
    {
      ko: [
        '당신은 사용자의 Obsidian 노트에서 커서 위치부터 글을 이어 쓰는 작성 도우미입니다.',
        '커서 앞 텍스트의 언어·문체·어조·마크다운 서식을 그대로 이어 자연스럽게 작성하세요.',
        '규칙:',
        '- 이어질 본문만 출력합니다. 설명·머리말·"알겠습니다" 같은 인사말을 넣지 않습니다.',
        '- 출력을 코드펜스(```)로 감싸지 않습니다.',
        '- 커서 앞 텍스트를 반복하지 말고 이어질 부분만 씁니다.',
        '- 문장이 중간에 끊긴 자리라면 그 문장을 자연스럽게 완성한 뒤 계속합니다.',
      ].join('\n'),
      en: [
        'You are a writing assistant continuing an Obsidian note from the cursor.',
        'Continue naturally in the language, style, tone, and Markdown formatting of the text before the cursor.',
        'Rules:',
        '- Output only the continuation. Do not add explanations, preambles, or greetings such as "Understood".',
        '- Do not wrap the output in code fences (```).',
        '- Do not repeat the text before the cursor; write only what follows.',
        '- If the cursor interrupts a sentence, complete it naturally before continuing.',
      ].join('\n'),
    },
    locale,
  )
}

function rewriteSystem(locale?: ModelLocale): string {
  return L(
    {
      ko: [
        '당신은 사용자가 선택한 노트 텍스트를 지시에 따라 다시 쓰는 편집 도우미입니다.',
        '규칙:',
        '- 다시 쓴 텍스트만 출력합니다. 설명·머리말 없이 결과 본문만 냅니다.',
        '- 출력을 코드펜스(```)로 감싸지 않습니다.',
        '- 원문의 언어와 마크다운 서식을 유지하되 지시를 반영합니다.',
        '- 지시가 모호하면 의미를 보존하며 표현만 다듬습니다.',
      ].join('\n'),
      en: [
        'You are an editing assistant rewriting selected note text according to the user instruction.',
        'Rules:',
        '- Output only the rewritten text, without explanations or preambles.',
        '- Do not wrap the output in code fences (```).',
        '- Preserve the original language and Markdown formatting while following the instruction.',
        '- If the instruction is ambiguous, preserve the meaning and polish the wording.',
      ].join('\n'),
    },
    locale,
  )
}

export function buildInlineMessages(
  input: InlineWritingInput,
): RequestMessage[] {
  const preceding = clampToTail(input.precedingText, MAX_PRECEDING_CHARS)
  const following = clampToHead(input.followingText ?? '', MAX_FOLLOWING_CHARS)
  const noteLine = input.notePath
    ? L({ ko: `노트: ${input.notePath}\n`, en: `Note: ${input.notePath}\n` })
    : ''
  const instruction = input.instruction?.trim()

  if (input.mode === 'rewrite') {
    const selection = clampToHead(input.selection ?? '', MAX_SELECTION_CHARS)
    // Blank instructions must use the default too.
    const rewriteInstruction = instruction
      ? instruction
      : L({
          ko: '의미를 보존하며 문장을 다듬어 주세요.',
          en: 'Polish the wording while preserving its meaning.',
        })
    const parts = [
      noteLine ? noteLine.trimEnd() : null,
      L({
        ko: `작성 지침: ${rewriteInstruction}`,
        en: `Writing instruction: ${rewriteInstruction}`,
      }),
      L({
        ko: '--- 선택한 원문 (이 부분만 다시 쓰기) ---',
        en: '--- Selected original text (rewrite only this part) ---',
      }),
      selection,
    ]
    if (preceding.trim()) {
      parts.push(
        L({
          ko: '--- 앞 문맥 (참고용, 수정 금지) ---',
          en: '--- Preceding context (reference only, do not edit) ---',
        }),
        preceding,
      )
    }
    if (following.trim()) {
      parts.push(
        L({
          ko: '--- 뒤 문맥 (참고용, 수정 금지) ---',
          en: '--- Following context (reference only, do not edit) ---',
        }),
        following,
      )
    }
    return [
      { role: 'system', content: rewriteSystem() },
      { role: 'user', content: parts.filter(Boolean).join('\n') },
    ]
  }

  const parts = [
    noteLine ? noteLine.trimEnd() : null,
    instruction
      ? L({
          ko: `작성 지침: ${instruction}`,
          en: `Writing instruction: ${instruction}`,
        })
      : null,
    L({
      ko: '--- 커서 앞 텍스트 (여기에 이어서 작성) ---',
      en: '--- Text before the cursor (continue here) ---',
    }),
    preceding,
  ]
  if (following.trim()) {
    parts.push(
      L({
        ko: '--- 커서 뒤 텍스트 (참고용, 수정 금지) ---',
        en: '--- Text after the cursor (reference only, do not edit) ---',
      }),
      following,
    )
  }
  return [
    { role: 'system', content: continueSystem() },
    { role: 'user', content: parts.filter(Boolean).join('\n') },
  ]
}

/**
 * Strips a single wrapping code fence and stray surrounding whitespace from a
 * model's inline output. For continuations the leading whitespace is meaningful
 * (the model may intentionally start with a space or newline), so it is kept.
 */
export function sanitizeInlineOutput(
  text: string,
  opts: { preserveLeading?: boolean } = {},
): string {
  let out = text
  const fenced = out.trim().match(/^```[^\n]*\n([\s\S]*?)\n?```$/)
  if (fenced) out = fenced[1]
  out = out.replace(/\s+$/, '')
  if (!opts.preserveLeading) out = out.replace(/^\s+/, '')
  return out
}
