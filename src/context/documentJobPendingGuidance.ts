import { type ModelLocale, getModelLocale } from '../i18n/modelLocale'
import { L } from '../i18n/modelText'
export const DOCUMENT_JOB_PRODUCTION_GUIDANCE = (
  locale: ModelLocale = getModelLocale(),
) =>
  L(
    {
      ko: '`produce_format_reuse`는 호출할 때 저장 승인을 따로 받으므로 초안 확인을 묻지 않고 이어서 호출합니다.',
      en: `Call \`produce_format_reuse\` next without asking to review the draft; save approval is requested separately when it runs.`,
    },
    locale,
  )

export const DOCUMENT_JOB_OUTPUT_NAME_GUIDANCE = (
  locale: ModelLocale = getModelLocale(),
) =>
  L(
    {
      ko: 'nextStep의 draft_path·output_path 파일 이름은 준비 때 정해진 값입니다. 사용자가 요청한 새 문서 이름과 다르면 두 경로의 파일 이름만 그 이름으로 바꿔 쓰세요(폴더·확장자·job_id는 그대로).',
      en: `The draft_path/output_path filenames in nextStep were chosen during preparation. If they differ from the new document name requested by the user, change only the filenames in both paths to that name (keep the folders, extensions and job_id).`,
    },
    locale,
  )
