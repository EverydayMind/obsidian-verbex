import { L } from '../i18n/modelText'

export function unknownTarget() {
  return L({
    ko: `복원 대상을 확인하지 못했습니다. 사람용 롤백 명령을 사용하세요.`,
    en: `Could not identify the restore target. Use the manual rollback command.`,
  })
}

export function empty() {
  return L({ ko: `없음`, en: `none` })
}

export function restored(
  p0: string | number,
  p1: string | number,
  p2: string | number,
) {
  return L({
    ko: `복원: ${p0}. 이 파일에 적용됐던 마지막 변경을 되돌렸다. 그 변경 뒤 다른 곳에서 바뀐 파일: ${p1}. 되돌리지 못해 제외한 항목: ${p2}개.`,
    en: `Restored: ${p0}. The last applied change to this file was reverted. Files changed elsewhere after that change: ${p1}. Items left out because they could not be reverted: ${p2}.`,
  })
}

export function failed() {
  return L({
    ko: `복원이 완료되지 않았습니다. 파일 상태를 확인하고 사람용 롤백 명령을 사용하세요.`,
    en: `Restoration did not complete. Check the file state and use the manual rollback command.`,
  })
}

export function rejected() {
  return L({
    ko: `사용자가 복원을 거절했습니다.`,
    en: `The user rejected restoration.`,
  })
}

export function unsupported() {
  return L({
    ko: `가장 최근 변경은 이 도구로 복원할 수 없습니다. 사람용 롤백 명령을 사용하세요.`,
    en: `The latest change cannot be restored with this tool. Use the manual rollback command.`,
  })
}

export function none() {
  return L({
    ko: `더 되돌릴 최근 변경이 없습니다. 이 도구는 Vault 파일에 적용된 변경만 되돌립니다. 문서 편집기 플러그인의 작업본 편집(예: 열려 있는 한글 문서)을 되돌리려면 이번 요청의 도구 목록에 있는 그 플러그인의 되돌리기 도구를 사용자에게 묻지 말고 바로 호출하세요.`,
    en: `There are no more recent changes to restore. This tool restores only changes applied to Vault files. To undo an edit to a document editor plugin's working copy (for example an open HWP document), call that plugin's undo tool from this request's tool list right away, without asking the user.`,
  })
}

export function unavailable() {
  return L({
    ko: `이 대화의 복원 경로를 사용할 수 없습니다. 사람용 롤백 명령을 사용하세요.`,
    en: `The restore path for this conversation is unavailable. Use the manual rollback command.`,
  })
}
