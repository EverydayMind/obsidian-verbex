import { L } from '../../i18n/modelText'

export function missingMention(mention: string, path: string) {
  return L({
    ko: `"${mention}"의 링크되지 않은 언급을 ${path}에서 찾지 못했습니다(코드·기존 링크·제목 줄·frontmatter 제외). 원문 그대로의 표기를 조사 없이 넘기세요.`,
    en: `No unlinked mention of "${mention}" was found in ${path} (excluding code, existing links, heading lines, and frontmatter). Pass the exact source spelling without Korean particles.`,
  })
}
export function selfLink(path: string, name: string) {
  return L({
    ko: `${path} 자체가 "${name}" 노트입니다. 자기 자신에게는 링크하지 않습니다.`,
    en: `${path} is itself the "${name}" note. A note does not link to itself.`,
  })
}
export function nameTakenText(path: string, link = false) {
  return L({
    ko: `같은 이름의 노트가 이미 있습니다: ${path}${link ? '. link_mentions로 그 노트에 링크하세요.' : ''}`,
    en: `A note with the same name already exists: ${path}${link ? '. Use link_mentions to link to that note.' : ''}`,
  })
}
export function noMentions(source: string, entity: string, surfaces: string[]) {
  return L({
    ko: `${source}에 ${entity}의 링크되지 않은 언급이 없습니다(${surfaces.join(', ')}).`,
    en: `There are no unlinked mentions of ${entity} in ${source} (${surfaces.join(', ')}).`,
  })
}
export function missingText(text: string) {
  return L({
    ko: `"${text}"을(를) 찾지 못했습니다.`,
    en: `"${text}" was not found.`,
  })
}
export function repeatedText(text: string) {
  return L({
    ko: `"${text}"이(가) 여러 번 나옵니다. 더 긴 고유 문구를 쓰세요.`,
    en: `"${text}" occurs multiple times. Use a longer, unique phrase.`,
  })
}
export function repeatedHeading(heading: string) {
  return L({
    ko: `제목 "${heading}"이(가) 여러 개입니다.`,
    en: `There are multiple headings named "${heading}".`,
  })
}
export function missingHeading(heading: string) {
  return L({
    ko: `제목 "${heading}"을(를) 찾지 못했습니다.`,
    en: `Heading "${heading}" was not found.`,
  })
}
export function sameTitle() {
  return L({
    ko: '제목이 이미 같습니다. 바꿀 것이 없습니다.',
    en: 'The title is already the same. Nothing needs changing.',
  })
}
export function caseOnlyRename() {
  return L({
    ko: '대소문자만 다른 이름 변경은 Windows에서 같은 파일로 취급되어 지원하지 않습니다.',
    en: 'Case-only renames are unsupported because Windows treats them as the same file.',
  })
}
export function comparisonHeader(source: string, target: string) {
  return L({
    ko: `[블록 비교] 원본 ${source} ↔ 대상 ${target}. id는 원본(${source}) 블록 기준이며 merge_notes의 extra_drop_block_ids에 씁니다.`,
    en: `[Block comparison] Source ${source} ↔ target ${target}. IDs refer to source (${source}) blocks and are used in extra_drop_block_ids for merge_notes.`,
  })
}
export function comparisonLinks(
  source: number,
  target: number,
  conflicts: string[],
) {
  return L({
    ko: `백링크: 원본 ${source}개, 대상 ${target}개. 속성 충돌: ${conflicts.join(', ') || '없음'}.`,
    en: `Backlinks: source ${source}, target ${target}. Property conflicts: ${conflicts.join(', ') || 'none'}.`,
  })
}
export function comparisonHeadings(
  identical: number,
  protectedCount: number,
  source: number,
  target: number,
) {
  return L({
    ko: [
      `## 똑같은 블록 (${identical})`,
      `## 다른 노트가 링크해 남겨야 하는 중복 블록 (${protectedCount})`,
      `## 원본에만 있는 블록 (${source})`,
      `## 대상에만 있는 블록 (${target})`,
    ],
    en: [
      `## Identical blocks (${identical})`,
      `## Duplicate blocks to keep because other notes link to them (${protectedCount})`,
      `## Blocks only in source (${source})`,
      `## Blocks only in target (${target})`,
    ],
  })
}
export function alreadyRejected(path: string, reason: string) {
  return L({
    ko: `[이미 거절됨] 이 대화에서 사용자가 같은 제안(${path})을 거절했습니다${reason ? `(사유: ${reason})` : ''}. 같은 제안을 다시 하지 말고 다음 후보로 넘어가세요. 사용자가 같은 변경을 다시 요청했을 때만 retry_rejected: true로 다시 제안합니다.`,
    en: `[Already rejected] The user rejected the same proposal (${path}) in this conversation${reason ? ` (reason: ${reason})` : ''}. Do not repeat the same proposal; move to the next candidate. Propose it again with retry_rejected: true only when the user requests the same change again.`,
  })
}
