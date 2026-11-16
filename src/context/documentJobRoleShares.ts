import { L } from '../i18n/modelText'

/** Below this share of top-level paragraphs a symbol role is described as optional. */
export const MINOR_ROLE_SHARE = 0.15

const RESERVED = ['-', '*', '+']
const NAMED_ROLE = /^[A-Z][A-Z0-9_]*(:.*)?$/

/** Measured top-level paragraph counts per role, as the contract carries them. */

/** Share of all measured paragraphs held by one role, or null without counts. */
export function roleShare(
  counts: Record<string, number>,
  marker: string,
): number | null {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  return total > 0 && counts[marker] != null ? counts[marker] / total : null
}

/** " 63%" for prose, or "" when the share is unknown. */
export function rolePercent(
  counts: Record<string, number>,
  marker: string,
): string {
  const share = roleShare(counts, marker)
  return share == null ? '' : ` ${Math.round(share * 100)}%`
}

/** Body first and proportioned; symbols are subordinate detail. */
export function bodySentence(counts: Record<string, number>): string {
  return roleShare(counts, 'BODY') != null
    ? L({
        ko: `본문의 대부분(측정 문단의${rolePercent(counts, 'BODY')})은 기호 없는 일반 문단으로 씁니다. 기호 문단은 그 아래 세부 항목에만 씁니다`,
        en: `Write most of the body (${rolePercent(counts, 'BODY')} of measured paragraphs) as plain paragraphs without symbols. Use symbol paragraphs only for subordinate details`,
      })
    : L({
        ko: '본문의 대부분은 기호 없는 일반 문단으로 쓰고, 기호 문단은 그 아래 세부 항목에만 씁니다',
        en: `Write most of the body as plain paragraphs without symbols; use symbol paragraphs only for subordinate details`,
      })
}

/** Symbol role markers in contract order, bounded like the contract itself. */
export function symbolMarkers(roles: Record<string, unknown>): string[] {
  return Object.keys(roles)
    .filter(
      (m) =>
        !RESERVED.includes(m) && !NAMED_ROLE.test(m) && [...m].length <= 16,
    )
    .slice(0, 14)
}

/** "ㅇ 19%·□ 8% 문단은 해당 기호로 줄을 시작합니다", or null with no symbols. */
export function symbolSentence(
  markers: readonly string[],
  counts: Record<string, number>,
): string | null {
  if (!markers.length) return null
  return (
    markers.map((m) => m + rolePercent(counts, m)).join('·') +
    L({
      ko: ' 문단은 해당 기호로 줄을 시작합니다',
      en: ` paragraphs start their lines with the corresponding symbol`,
    })
  )
}

/**
 * The dash role is an ordinary Markdown list item: the Exporter applies the
 * derived "-" rule to top-level bullet items. Called optional when the sample
 * uses it in fewer than MINOR_ROLE_SHARE of top-level paragraphs.
 */
export function listRoleSentence(counts: Record<string, number>): string {
  const share = roleShare(counts, '-')
  const minor = share != null && share < MINOR_ROLE_SHARE
  return (
    L({
      ko: '- 역할 문단은 "- "로 시작하는 Markdown 목록 항목으로 씁니다(최상위 항목에 서식 적용)',
      en: `Write - role paragraphs as Markdown list items starting with "- " (style applies to top-level items)`,
    }) +
    (minor
      ? L({
          ko: `(이 역할은${rolePercent(counts, '-')}로 선택 사항)`,
          en: `(this role is optional at${rolePercent(counts, '-')})`,
        })
      : '')
  )
}
export { roleCounts } from './documentJobRoleFacts'
