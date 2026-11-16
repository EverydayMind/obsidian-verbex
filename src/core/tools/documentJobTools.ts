import saveParameters from '../../../contracts/document-jobs/v1/save-request.schema.json'
import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import type { RequestTool } from '../../types/llm/request'

import {
  getPrepareParameters,
  getProduceParameters,
} from './localizedDocumentJobSchemas'
export { DOCUMENT_JOB_TOOL_REGISTRY } from './documentJobToolRegistry'

export function getDocumentJobToolDefinitions(
  locale: ModelLocale = getModelLocale(),
): RequestTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'save_format_decomposition',
        description: L(
          {
            ko: '준비된 샘플 분해본의 텍스트 MD와 템플릿 HWPX를 승인 1회로 저장합니다. nextStep의 job_id를 전달하세요. 미확정·부분 저장·중단이면 후속 쓰기를 하지 않습니다. 저장해도 새 문서 초안은 만들어지지 않습니다. 이어서 nextStep대로 write_file로 draft_path에 초안을 쓴 뒤 produce_format_reuse를 부릅니다. 분해본 저장은 선택 단계입니다.',
            en: 'Save a prepared sample decomposition’s text MD and template HWPX with one approval. Pass job_id from nextStep. Do not make follow-up writes if unresolved, partially saved, or stopped. Saving does not create a new document draft. Then follow nextStep: write the draft to draft_path with write_file before calling produce_format_reuse. Saving the decomposition is optional.',
          },
          locale,
        ),
        parameters: saveParameters as RequestTool['function']['parameters'],
      },
    },
    {
      type: 'function',
      function: {
        name: 'prepare_format_reuse',
        description: L(
          {
            ko: '샘플 한글 문서의 서식 재사용 작업을 준비합니다. 새 작업에는 sample_path(선택: output_name, base_font_pt)만 넣습니다. 본문 선택 응답에는 직전 결과의 job_id와 choices만 넣습니다. 두 형태를 섞거나 job_id를 지어내지 마세요. ready의 draft_contract와 nextStep을 따릅니다.',
            en: 'Prepare format reuse from a sample HWP/HWPX document. For a new job, pass only sample_path (optional: output_name, base_font_pt). For a body-selection reply, pass only job_id from the previous result and choices. Do not mix these forms or invent job_id. Follow draft_contract and nextStep in ready.',
          },
          locale,
        ),
        parameters: getPrepareParameters(
          locale,
        ) as RequestTool['function']['parameters'],
      },
    },
    {
      type: 'function',
      function: {
        name: 'produce_format_reuse',
        description: L(
          {
            ko: '준비된 작업과 저장된 초안으로 새 HWPX를 생성합니다. 초안은 이 도구나 save_format_decomposition이 만들지 않습니다. 먼저 write_file로 nextStep.arguments.draft_path에 초안을 씁니다. 직전 결과 nextStep.arguments의 job_id, draft_path, output_path를 전달하세요(사용자가 문서 이름을 정했으면 두 경로의 파일 이름만 바꿉니다). 저장은 승인과 체크포인트를 거치며 검증된 사실과 미검증 항목을 구분합니다.',
            en: 'Generate a new HWPX from a prepared job and saved draft. Neither this tool nor save_format_decomposition creates the draft. First write it to nextStep.arguments.draft_path with write_file. Pass job_id, draft_path, and output_path from the previous result’s nextStep.arguments (if the user chose a document name, change only the filenames in both paths). Saving goes through approval and checkpoints, and separates verified facts from unverified items.',
          },
          locale,
        ),
        parameters: getProduceParameters(
          locale,
        ) as RequestTool['function']['parameters'],
      },
    },
  ]
}

/** Compatibility export; runtime consumers use the locale factory. */
export const DOCUMENT_JOB_TOOL_DEFINITIONS = getDocumentJobToolDefinitions()
