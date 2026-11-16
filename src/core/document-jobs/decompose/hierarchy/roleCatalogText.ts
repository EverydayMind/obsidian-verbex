import type { ModelLocale } from '../../../../i18n/modelLocale'
import { L } from '../../../../i18n/modelText'
import { ROLE_CATALOG_VERSION } from '../dialectV2'

export const roleCatalog = (locale?: ModelLocale) =>
  Object.freeze({
    version: ROLE_CATALOG_VERSION,
    descriptions: {
      보고자: L(
        {
          ko: '제목 바로 다음에 {size}pt 내외 작은 글씨로 보고일자·보고자·연락처를 적는 관행',
          en: 'Reporting date, reporter and contact details in small text around {size}pt immediately after the title',
        },
        locale,
      ),
      별첨: L(
        {
          ko: '<참고·<붙임 등으로 시작하는 제목으로 별도 자료를 덧붙이는 관행',
          en: 'Appending separate material under a heading starting with a reference or attachment marker',
        },
        locale,
      ),
      주석: L(
        {
          ko: '하나 이상의 *로 시작하는 {size}pt 내외 작은 글씨 문단으로 앞 문단이나 특정 어구에 주석을 붙이는 관행',
          en: 'Annotating the preceding paragraph or a specific phrase with a small-text paragraph around {size}pt starting with one or more * characters',
        },
        locale,
      ),
      참고표: L(
        {
          ko: '글 흐름에서 약간 벗어나지만 알아둘 참고사항',
          en: 'Useful reference information slightly outside the main flow of the text',
        },
        locale,
      ),
      번호_매기기_제목: L(
        {
          ko: '번호 매기기 제목(번호는 템플릿이 붙임)',
          en: 'Numbered heading (the template adds the number)',
        },
        locale,
      ),
    },
  })
