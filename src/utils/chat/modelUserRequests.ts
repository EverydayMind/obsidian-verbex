import { L } from '../../i18n/modelText'

export function saveDocumentRequest(path: string): string {
  return L({
    ko: `${path} 문서를 저장해 주세요.`,
    en: `Please save document ${path}.`,
  })
}
