import { L } from '../../i18n/modelText'

export function missingDraftMessage(jobDraftExists: boolean) {
  return jobDraftExists
    ? L({
        ko: '요청한 초안 경로에는 파일이 없습니다. 이 작업이 정한 초안 경로(nextStep.arguments.draft_path)에는 준비 뒤에 생긴 파일이 있습니다. 그 초안을 변환하려면 nextStep.arguments로 produce_format_reuse를 다시 호출하세요. 내용을 바꿔야 하면 write_file로 그 경로의 초안을 고친 뒤 호출하세요.',
        en: 'There is no file at the requested draft path. The job-defined draft path (nextStep.arguments.draft_path) contains a file created after preparation. To convert that draft, call produce_format_reuse again with nextStep.arguments. To change its content, first edit the draft at that path with write_file, then call it again.',
      })
    : L({
        ko: '초안 파일이 없습니다. produce_format_reuse는 이미 저장된 Markdown 초안을 HWPX로 바꿀 뿐 초안을 만들지 않습니다. 먼저 write_file로 nextStep.arguments.draft_path에 draft_contract(roles·syntax_guidance)를 따른 초안 본문을 쓰고, 같은 nextStep.arguments로 produce_format_reuse를 다시 호출하세요. 사용자에게 다시 묻지 마세요. 새 문서의 사실·수치는 요청 주제의 사용자 자료와 조사 결과로 쓰고, 샘플·본보기의 내용은 옮기지 않습니다. 필요한 자료를 확인한 뒤 초안을 쓰세요(쓰기 승인은 화면에서 따로 받습니다).',
        en: 'The draft file is missing. produce_format_reuse only converts an already saved Markdown draft to HWPX; it does not create a draft. First use write_file to write the draft body at nextStep.arguments.draft_path according to draft_contract (roles and syntax_guidance), then call produce_format_reuse again with the same nextStep.arguments. Do not ask the user again. Use user materials and research results about the requested topic for facts and figures in the new document; do not copy content from the sample or exemplar. Check the necessary materials before writing the draft (write approval is requested separately in the UI).',
      })
}

export function unboundDraftMessage(unsupported: boolean) {
  return (
    L({
      ko: '초안 frontmatter가 이 작업의 템플릿을 가리키지 않습니다. 요청한 초안 맨 앞 frontmatter에 expected_lines 두 줄을 넣어 같은 nextStep.arguments.draft_path에 write_file로 고칩니다. 그 뒤 같은 arguments로 produce_format_reuse를 호출합니다. 사용자에게 묻지 않습니다.',
      en: "The draft frontmatter does not point to this job's template. Put the two expected_lines in frontmatter at the very start of the requested draft and edit the same nextStep.arguments.draft_path with write_file. Then call produce_format_reuse with the same arguments. Do not ask the user.",
    }) +
    (unsupported
      ? L({
          ko: ' frontmatter를 `---` 한 줄로 열고 닫는 단순 형식, `키: "값"` 한 줄 형식으로 다시 씁니다.',
          en: ' Rewrite the frontmatter in the simple format with a single `---` line at each end and one `key: "value"` per line.',
        })
      : '')
  )
}
