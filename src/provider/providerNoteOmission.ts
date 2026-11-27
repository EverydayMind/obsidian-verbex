import { modelMarker } from '../i18n/modelMarkers'
import { L } from '../i18n/modelText'

/**
 * Replaces one provider's instruction text when the notes budget leaves it
 * out. The approved instructions are only shown less, so the approval scope is
 * unchanged; the provider's tools, host facts, paths and editor scope stay.
 */
export const instructionsOmittedLine = () =>
  L({
    ko: `${modelMarker('hostFact', 'ko')} 지시문 생략(예산): 이 플러그인의 사용법은 요청 예산 때문에 싣지 않았다. 도구 설명과 위 목록을 따른다.`,
    en: `${modelMarker('hostFact', 'en')} Instructions omitted (budget): this plugin's usage guidance was left out to fit the request budget. Follow the tool descriptions and the list above.`,
  })
