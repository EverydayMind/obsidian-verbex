import { L } from './i18n/modelText'

export function inventoryMark(embedded: boolean) {
  return embedded
    ? L({ ko: '본문 포함', en: 'Body included' })
    : L({ ko: '목록만', en: 'List only' })
}

export function inventoryWiki() {
  return L({ ko: ' [우선 참고 위키]', en: ' [Priority wiki]' })
}

export function inventoryOmitted(count: number) {
  return L({
    ko: `- ... ${count}개 파일은 inventory 상한으로 생략됨. folder_tree/read_file로 페이지 조회하십시오.`,
    en: `- ... ${count} files omitted due to the inventory limit. Page through them with folder_tree/read_file.`,
  })
}

export function inventoryFolder(path: string, count: number, lines: string) {
  return L({
    ko: `### 폴더: ${path} (파일 ${count}개)\n${lines}`,
    en: `### Folder: ${path} (${count} files)\n${lines}`,
  })
}

export function inventoryHeader(blocks: string) {
  return L({
    ko: `## 첨부한 폴더의 전체 파일 목록\n사용자가 첨부한 폴더에 들어 있는 모든 파일입니다. 컨텍스트 한도 때문에 "[목록만]"으로 표시된 파일은 본문이 아직 컨텍스트에 포함되지 않았습니다. 작업에 필요한데 본문이 없는 파일은 read_file 도구로 직접 열어 내용을 확인하세요. ("[본문 포함]" 파일은 이미 위에 본문이 들어 있으니 다시 읽을 필요가 없습니다.)\n\n${blocks}`,
    en: `## Complete file inventory of attached folders\nThese are all files in the folders attached by the user. Files marked "[List only]" do not yet have their bodies in context due to the context limit. If a file is needed for the task but its body is missing, open it with read_file to inspect its contents. (Files marked "[Body included]" already have their bodies above and do not need to be read again.)\n\n${blocks}`,
  })
}

export function changeProposalFailure(path: string) {
  return L({
    ko: `변경안 생성 실패: ${path}`,
    en: `Failed to generate a proposed change: ${path}`,
  })
}
