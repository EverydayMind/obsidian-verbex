import { L } from '../../i18n/modelText'
import { runtimeTimers } from '../../platform/runtime'
import { copyJson } from '../../provider/interop/descriptorReader'
import type { ToolArgs } from '../tools/localToolCommon'

import type { StyleApi } from './kordocStyleApi'
import type { ProfileV2 } from './profileV2'
import type { ProfileMachine } from './types'
import { parseVariantMarker } from './variantMarkers'

type Kind = 'guidance' | 'role' | 'variant' | 'legacy'
type Candidate = { text: string; kinds: Set<Kind> }

async function inspectWithinBudget(
  inspect: NonNullable<StyleApi['inspectTextOverlap']>,
  input: {
    path: string
    expectedSha256: string
    candidates: string[]
    signal?: AbortSignal
  },
): Promise<unknown> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  input.signal?.addEventListener('abort', abort, { once: true })
  const timer = runtimeTimers.setTimeout(abort, 5000)
  try {
    if (input.signal?.aborted) throw new Error('overlap interrupted')
    const interrupted = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) reject(new Error('overlap interrupted'))
      else
        controller.signal.addEventListener(
          'abort',
          () => reject(new Error('overlap interrupted')),
          { once: true },
        )
    })
    return await Promise.race([
      inspect({ ...input, signal: controller.signal }),
      interrupted,
    ])
  } finally {
    runtimeTimers.clearTimeout(timer)
    input.signal?.removeEventListener('abort', abort)
  }
}

/** Candidate extraction is deliberately bounded and incomplete. These are
 * proposed values, never source excerpts. */
export function overlapCandidates(
  args: ToolArgs,
  machine: ProfileMachine | ProfileV2,
): { candidates: Candidate[]; incomplete: boolean } {
  const candidates: Candidate[] = [],
    seen = new Map<string, Candidate>()
  const extra: { kind: Kind; text: string }[] = [],
    extraSeen = new Set<string>()
  let incomplete = false
  const addExtra = (kind: Kind, text: string) => {
    const key = JSON.stringify([kind, text])
    if (!extraSeen.has(key) && extra.length < 64) {
      extraSeen.add(key)
      extra.push({ kind, text })
    }
  }
  const add = (kind: Kind, text: string) => {
    const normalized = text.normalize('NFKC').toLowerCase()
    const points = [...normalized]
    if (points.length < 6) {
      if (points.length) incomplete = true
      return
    }
    if (points.length > 128) {
      incomplete = true
      // Keep the original prefix priority. Sample later fragments only after
      // all original candidates, so the 64-item cap cannot displace them.
      for (const start of [
        128,
        Math.floor(points.length / 2),
        points.length - 8,
      ]) {
        const text = points.slice(start, start + 8).join('')
        if ([...text].length === 8) addExtra(kind, text)
      }
    }
    const token = points.slice(0, 128).join('')
    const existing = seen.get(token)
    if (existing) {
      existing.kinds.add(kind)
      return
    }
    if (candidates.length >= 64) {
      incomplete = true
      return
    }
    const candidate = { text: token, kinds: new Set([kind]) }
    seen.set(token, candidate)
    candidates.push(candidate)
  }
  const operation = args.operation
  if (operation === 'set_guidance' && typeof args.guidance === 'string') {
    const guidance = args.guidance
    // The word pass excludes symbols and the token pass cannot cover every
    // symbol combination; never imply that a nonempty instruction was fully checked.
    if (/[^\p{L}\p{N}_\s-]/u.test(guidance)) incomplete = true
    for (const word of guidance.matchAll(/[\p{L}\p{N}_-]+/gu))
      add('guidance', word[0])
    // Keep exact intervening whitespace: a multiword name can be sensitive
    // even when each component is shorter than the single-token threshold.
    const words: RegExpMatchArray[] = []
    const addPhrases = () => {
      const first = words[0]
      for (const last of words.slice(1)) {
        const phrase = guidance.slice(
          first.index,
          (last.index ?? 0) + last[0].length,
        )
        if (!/^[\p{L}\p{N}_-]+(?:\s+[\p{L}\p{N}_-]+)+$/u.test(phrase)) {
          const points = [...phrase.normalize('NFKC').toLowerCase()]
          if (
            points.length >= 6 &&
            points.length <= 128 &&
            /^[\p{L}\p{N}_-]+(?:[\s\p{P}\p{S}]+[\p{L}\p{N}_-]+)+$/u.test(phrase)
          )
            addExtra('guidance', phrase)
          break
        }
        if ([...phrase.normalize('NFKC').toLowerCase()].length >= 6)
          add('guidance', phrase)
      }
    }
    for (const word of guidance.matchAll(/[\p{L}\p{N}_-]+/gu)) {
      words.push(word)
      if (words.length === 3) {
        addPhrases()
        words.shift()
      }
    }
    if (words.length === 2) addPhrases()
    // Also compare bounded non-whitespace tokens containing symbols, such as
    // an address or identifier split by punctuation in the word pass above.
    for (const token of guidance.matchAll(/\S+/gu)) {
      if (
        /[^\p{L}\p{N}_-]/u.test(token[0]) &&
        [...token[0].normalize('NFKC').toLowerCase()].length >= 6
      )
        add('guidance', token[0])
    }
  }
  const visit = (value: unknown, depth = 0): void => {
    if (!value || typeof value !== 'object') return
    if (depth > 8) {
      incomplete = true
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === 'string') {
        if (key === 'variant') add('variant', item)
        else if (key === 'marker') {
          const named = parseVariantMarker(item)
          if (named) add('variant', named.variant)
        } else if (
          (key === 'role' || key === 'parentRole') &&
          item.startsWith('X-')
        )
          add('role', item.slice(2))
        else if (key === 'key') add('legacy', item)
      } else visit(item, depth + 1)
    }
  }
  if (
    [
      'set_role_styles',
      'set_semantics',
      'set_text_profile',
      'set_bindings',
    ].includes(String(operation))
  )
    visit(args)
  if (
    operation === 'upgrade_schema' &&
    machine.schema === 'report-style-profile/2'
  )
    visit(machine.roleStyleMap)
  for (const item of extra) add(item.kind, item.text)
  return { candidates, incomplete }
}

export async function profileOverlapNotes(input: {
  args: ToolArgs
  machine: ProfileMachine | ProfileV2
  api: () => StyleApi
  path: (path: string) => string
  signal?: AbortSignal
}): Promise<string[]> {
  const { args, machine, api, path, signal } = input
  const relevant = [
    'set_guidance',
    'set_role_styles',
    'set_semantics',
    'set_text_profile',
    'set_bindings',
    'upgrade_schema',
  ].includes(String(args.operation))
  if (!relevant) return []
  const { candidates, incomplete } = overlapCandidates(args, machine)
  const caveat = L({
    ko: '검사는 제한된 후보의 측정 문단 내 부분 일치만 확인하며 원문 비노출이나 민감정보 부재를 보장하지 않습니다. 검사 이후 원본 변경은 다시 확인하지 않습니다.',
    en: 'The check only looks for partial matches of a limited set of candidates within measured paragraphs; it does not guarantee that source text is undisclosed or that sensitive information is absent. Source changes after the check are not rechecked.',
  })
  if (!candidates.length && !incomplete) return []
  if (!candidates.length)
    return [
      L({
        ko: `원문 중복 검사: 검사할 후보를 충분히 추출하지 못했습니다. ${caveat}`,
        en: `Source overlap check: could not extract enough candidates to check. ${caveat}`,
      }),
    ]
  try {
    if (signal?.aborted) throw new Error('cancelled')
    const style = api()
    if (typeof style.inspectTextOverlap !== 'function')
      throw new Error('unavailable')
    const raw = copyJson(
      await inspectWithinBudget(
        (request) => {
          if (!style.inspectTextOverlap) throw new Error('unavailable')
          return style.inspectTextOverlap(request)
        },
        {
          path: path(machine.sourcePath),
          expectedSha256: machine.snapshot.source.sha256,
          candidates: candidates.map((candidate) => candidate.text),
          signal,
        },
      ),
      { maxDepth: 4, maxNodes: 100, maxBytes: 4096 },
    ) as Record<string, unknown>
    if (signal?.aborted) throw new Error('cancelled')
    if (
      raw.status !== 'ok' ||
      raw.sourceSha256 !== machine.snapshot.source.sha256 ||
      raw.measurementSha256 !== machine.measurementSha256 ||
      raw.checkedCandidates !== candidates.length ||
      !Array.isArray(raw.matchedIndices) ||
      raw.matchedIndices.some(
        (index: unknown) =>
          !Number.isInteger(index) ||
          (index as number) < 0 ||
          (index as number) >= candidates.length,
      ) ||
      new Set(raw.matchedIndices).size !== raw.matchedIndices.length
    )
      throw new Error('invalid result')
    const kinds = new Set<Kind>()
    for (const index of raw.matchedIndices as number[])
      for (const kind of candidates[index].kinds) kinds.add(kind)
    const label: Record<Kind, string> = {
      guidance: L({ ko: '작성 지침', en: 'writing guidance' }),
      role: L({ ko: '사용자 정의 역할', en: 'custom role' }),
      variant: L({ ko: '변형 이름', en: 'variant name' }),
      legacy: L({ ko: '기존 이름', en: 'legacy name' }),
    }
    const finding = kinds.size
      ? L({
          ko: `측정 문단과 겹치는 후보가 있습니다: ${[...kinds].map((kind) => label[kind]).join(', ')}.`,
          en: `Some candidates overlap with measured paragraphs: ${[...kinds].map((kind) => label[kind]).join(', ')}.`,
        })
      : L({
          ko: '검사한 후보에서 측정 문단과의 부분 일치가 관측되지 않았습니다.',
          en: 'No partial matches with measured paragraphs were observed among the checked candidates.',
        })
    return [
      L({
        ko: `${finding} ${candidates.length}개 후보 검사${incomplete ? ' (일부 후보 생략)' : ''}. ${caveat}`,
        en: `${finding} Checked ${candidates.length} candidates${incomplete ? ' (some candidates omitted)' : ''}. ${caveat}`,
      }),
    ]
  } catch {
    if (signal?.aborted) throw new Error('Report style operation cancelled.')
    return [
      L({
        ko: `원문 중복 검사를 완료하지 못했습니다. ${caveat}`,
        en: `Could not complete the source overlap check. ${caveat}`,
      }),
    ]
  }
}
