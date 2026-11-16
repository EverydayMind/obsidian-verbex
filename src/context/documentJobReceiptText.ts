import { L } from '../i18n/modelText'

export function documentJobReceiptHeader(): string {
  return L({
    ko: '이 대화의 문서 작업 저장 영수증입니다(저장 당시 호스트 기록이며 현재 파일 상태는 재확인이 필요합니다).',
    en: `Document-job save receipts from this conversation (host records at save time; current file state requires checking).`,
  })
}
