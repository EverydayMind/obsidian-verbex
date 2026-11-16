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
    ko: `복원: ${p0}. 적용 뒤 변경된 파일: ${p1}. 적용되지 않아 제외된 항목: ${p2}개.`,
    en: `Restored: ${p0}. Files changed since application: ${p1}. Items excluded because they were not applied: ${p2}.`,
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
    ko: `더 되돌릴 최근 변경이 없습니다.`,
    en: `There are no more recent changes to restore.`,
  })
}

export function unavailable() {
  return L({
    ko: `이 대화의 복원 경로를 사용할 수 없습니다. 사람용 롤백 명령을 사용하세요.`,
    en: `The restore path for this conversation is unavailable. Use the manual rollback command.`,
  })
}
