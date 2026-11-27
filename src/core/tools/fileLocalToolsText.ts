import { L } from '../../i18n/modelText'

export function folderBudgetOmitted(p0: string | number, p1: string | number) {
  return L({
    ko: `토큰 예산으로 제외된 ${p0}개 파일(필요 시 note_outline/read_note_section/read_note_lines 또는 max_tokens 상향으로 추가 검토):\n${p1}`,
    en: `Files excluded by the token budget: ${p0} (for further review, use note_outline/read_note_section/read_note_lines or increase max_tokens):\n${p1}`,
  })
}

export function folderAlternatives(p0: string | number) {
  return L({
    ko: `유사 폴더 후보: ${p0}`,
    en: `Similar folder candidates: ${p0}`,
  })
}

export function folderResultHeader(
  p0: string | number,
  p1: string | number,
  p2: string | number,
  p3: string | number,
  p4: string | number,
  p5: string | number,
) {
  return L({
    ko: `폴더 "${p0}" (질의: "${p1}") — 전체 ${p2}개 중 ${p3}개를 컨텍스트에 포함했습니다 (약 ${p4} 토큰 / 예산 ${p5}).`,
    en: `Folder "${p0}" (query: "${p1}") — Included ${p3} of ${p2} files in context (approximately ${p4} tokens / budget ${p5}).`,
  })
}

export function emptyFolder(p0: string | number, p1: string | number) {
  return L({
    ko: `(폴더 "${p0}"에 ${p1}파일이 없습니다)`,
    en: `(Folder "${p0}" contains no ${p1}files)`,
  })
}

export function folderCandidate(p0: string | number, p1: string | number) {
  return L({ ko: `${p0} (${p1}개)`, en: `${p0} (${p1} files)` })
}

export function missingFolder(p0: string | number) {
  return L({
    ko: `(폴더를 찾지 못했습니다: "${p0}")`,
    en: `(Folder not found: "${p0}")`,
  })
}

export function noBaseDefinition() {
  return L({
    ko: '이 파일에는 렌더링할 Base 정의 또는 Base 임베드가 없습니다.',
    en: 'This file contains no Base definition or Base embed to render.',
  })
}

export function embeddedBaseResult(p0: string | number) {
  return L({
    ko: `# 임베드된 Base 렌더링 결과: ${p0}`,
    en: `# Embedded Base rendering results: ${p0}`,
  })
}

export function partialProjection() {
  return L({
    ko: '[추출 단계에서 원문 일부만 투영됨]',
    en: '[Only part of the source was projected during extraction]',
  })
}

export function missingReadFile(p0: string | number) {
  return L({
    ko: `File not found: ${p0}. 이 파일이 볼트에 존재하는지 확인하십시오. 경로가 확실치 않다면 search_vault나 iterative_search 도구를 사용해 정확한 경로를 검색할 수 있습니다.`,
    en: `File not found: ${p0}. Check that this file exists in the Vault. If the path is uncertain, use search_vault or iterative_search to find the exact path.`,
  })
}

export function unreadDocument(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `읽지 못한 문서: ${p0} (state=${p1}, next=${p2})`,
    en: `Unread document: ${p0} (state=${p1}, next=${p2})`,
  })
}

export function noHeadings() {
  return L({ ko: '(headings 없음)', en: '(no headings)' })
}

export function folderReadGuidance() {
  return L({
    ko: '앞부분만 잘라 근거로 쓰지 않습니다. 전체 검토가 필요하면 아래 구조를 보고 note_outline -> read_note_section/read_note_lines 순서로 필요한 조각을 읽으세요.',
    en: 'A truncated beginning is not used as evidence. If a full review is needed, inspect the structure below and use note_outline -> read_note_section/read_note_lines to read the required sections.',
  })
}

export function folderFileSize(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `크기: ${p0}B, ${p1} lines, ~${p2} tokens`,
    en: `Size: ${p0}B, ${p1} lines, ~${p2} tokens`,
  })
}

export function folderBodyOmitted(p0: string | number) {
  return L({
    ko: `[본문 미포함: 이 파일 하나만으로 read_folder 예산 ${p0} 토큰을 초과합니다.]`,
    en: `[Body omitted: This file alone exceeds the read_folder budget of ${p0} tokens.]`,
  })
}

export function unavailableBaseRender(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `## Base: ${p0}${p1}\n\n(렌더링 결과를 제공할 수 없습니다 — ${p2}. 원본 정의를 사용하세요.)`,
    en: `## Base: ${p0}${p1}\n\n(Rendering results are unavailable — ${p2}. Use the original definition.)`,
  })
}

export function baseRenderFailure(p0: string | number) {
  return L({ ko: `렌더링 실패 (${p0})`, en: `Rendering failed (${p0})` })
}

export function unsupportedBaseSyntax(p0: string | number) {
  return L({
    ko: `이 base는 렌더러가 지원하지 않는 구문을 사용합니다 (${p0})`,
    en: `This base uses syntax unsupported by the renderer (${p0})`,
  })
}

export function cachedBaseResult(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `## Base 렌더링 결과 (cached): ${p0}${p1}\n\n${p2}`,
    en: `## Base rendering result (cached): ${p0}${p1}\n\n${p2}`,
  })
}

export function liveBaseResult(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `## Base 렌더링 결과 (live): ${p0}${p1}\n\n${p2}`,
    en: `## Base rendering result (live): ${p0}${p1}\n\n${p2}`,
  })
}

export function missingBaseEmbed(p0: string | number) {
  return L({
    ko: `임베드된 Base 파일을 찾을 수 없습니다: ${p0}`,
    en: `Embedded Base file not found: ${p0}`,
  })
}
