import { L } from '../../i18n/modelText'

export function engineEvaluationHeader(
  thisPath?: string,
  thisIsBaseItself?: boolean,
): string {
  const mode = L({
    ko: '평가: Bases 엔진',
    en: 'Evaluation: Bases engine',
  })
  if (thisIsBaseItself)
    return `${mode}\n${L({
      ko: '`this` 기준: 이 .base 파일 자신(노트 기준 결과가 필요하면 context_path에 그 노트를 주세요)',
      en: '`this` context: this .base file itself (pass the note as context_path for note-based results)',
    })}`
  if (!thisPath) return mode
  return `${mode}\n${L({
    ko: `\`this\` 기준: ${thisPath}`,
    en: `\`this\` context: ${thisPath}`,
  })}`
}

export function fallbackEvaluationHeader(thisPath?: string): string {
  const mode = L({
    ko: '평가: Bases 엔진을 쓰지 못해 자체 평가(공식·`this`·Markdown 밖 파일 미지원)',
    en: 'Evaluation: Fallback evaluator because the Bases engine is unavailable (formulas, `this`, and non-Markdown files are not supported)',
  })
  if (!thisPath) return mode
  return `${mode}\n${L({
    ko: `\`this\` 기준: ${thisPath}`,
    en: `\`this\` context: ${thisPath}`,
  })}`
}

export function viewNotFoundMessage(
  label: string,
  view: string,
  available: readonly string[],
): string {
  const list =
    available.length > 0
      ? available.join(', ')
      : L({ ko: '(이름 있는 view 없음)', en: '(no named views)' })
  return L({
    ko: `## Base: ${label}#${view}\n\n(요청한 view '${view}'을(를) 찾지 못했습니다. 사용 가능한 view: ${list})`,
    en: `## Base: ${label}#${view}\n\n(View '${view}' was not found. Available views: ${list})`,
  })
}

export function baseSyntaxErrorResult(
  label: string,
  viewLabel: string,
  errors: readonly string[],
): string {
  const detail = errors.map((err) => `- ${err}`).join('\n')
  return L({
    ko: `## Base: ${label}${viewLabel}\n\n(Base 정의에 구문 오류가 있어 결과가 비어 있습니다:\n${detail})`,
    en: `## Base: ${label}${viewLabel}\n\n(The Base definition has syntax errors resulting in 0 rows:\n${detail})`,
  })
}

export function baseAbortedResult(label: string, viewLabel: string): string {
  return L({
    ko: `## Base: ${label}${viewLabel}\n\n(Base 평가가 취소되었습니다.)`,
    en: `## Base: ${label}${viewLabel}\n\n(Base evaluation was cancelled.)`,
  })
}

export function contextPathNotFound(contextPath: string): string {
  return L({
    ko: `context_path 노트를 찾지 못했습니다: ${contextPath}`,
    en: `context_path note not found: ${contextPath}`,
  })
}

export function appliedBaseObservation(
  views: readonly { name: string; count: number }[],
): string {
  const items = views
    .map((view) =>
      L({
        ko: `view '${view.name}' ${view.count}행`,
        en: `view '${view.name}' ${view.count} ${view.count === 1 ? 'row' : 'rows'}`,
      }),
    )
    .join(', ')
  const hasEmpty = views.some((view) => view.count === 0)
  const suffix = hasEmpty
    ? L({
        ko: ' — 0행 view가 있습니다. 필터·속성 이름을 확인하세요.',
        en: ' — a view returned 0 rows. Check filter and property names.',
      })
    : ''
  return L({
    ko: `적용 결과: ${items}${suffix}`,
    en: `Applied result: ${items}${suffix}`,
  })
}
