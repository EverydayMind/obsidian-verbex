import prepareSchema from '../../../contracts/document-jobs/v1/prepare-request.schema.json'
import produceSchema from '../../../contracts/document-jobs/v1/produce-request.schema.json'

export const prepareParameters = {
  type: 'object',
  properties: {
    sample_path: {
      ...prepareSchema.oneOf[0].properties.sample_path,
      description: '새 작업의 샘플 HWP/HWPX 경로. 새 작업에서만 지정합니다.',
    },
    output_name: {
      ...prepareSchema.oneOf[0].properties.output_name,
      description: '새 문서 이름(선택, 경로 아님).',
    },
    base_font_pt: {
      ...prepareSchema.oneOf[0].properties.base_font_pt,
      description:
        '새 작업의 기준 본문 크기(pt, 6~40, 0.5 단위). 생략하면 설정값.',
    },
    job_id: {
      ...prepareSchema.oneOf[1].properties.job_id,
      description:
        '본문 선택 응답 시 직전 결과의 job_id를 그대로 사용합니다. 지어내지 마세요.',
    },
    choices: {
      ...prepareSchema.oneOf[1].properties.choices,
      description: '본문 선택 응답 시 직전 질문의 선택지를 전달합니다.',
    },
  },
  additionalProperties: false,
}

export const produceParameters = {
  ...produceSchema,
  properties: {
    job_id: {
      ...produceSchema.properties.job_id,
      description: '직전 준비 결과 nextStep.arguments의 job_id.',
    },
    draft_path: {
      ...produceSchema.properties.draft_path,
      description: 'nextStep.arguments의 저장된 Markdown 초안 경로.',
    },
    output_path: {
      ...produceSchema.properties.output_path,
      description: 'nextStep.arguments의 새 HWPX 경로.',
    },
  },
}
