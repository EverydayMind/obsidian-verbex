import type { ModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
import { noteFormat } from '../../i18n/noteFormats'

export function treatyPacketText(locale?: ModelLocale) {
  return L(
    {
      ko: {
        omitted:
          '[보조 문맥 일부가 예산 제한으로 생략되었습니다. 해당 원문을 확인하지 못한 사항은 단정하지 마십시오.]',
        referencesOmitted:
          '[참조·정의어 일부는 경로 제한, 개수 상한 또는 파일 부재로 보조 문맥에 포함되지 않았습니다.]',
        sourceOmitted:
          '[이 보조 원문의 나머지는 길이 제한으로 생략되었습니다.]',
        map: '문서맵',
        terms: '사용 정의어',
        references: '직접 참조 조문',
        parent: '상위 장',
        noRows: '이슈가 없으면 데이터 행을 만들지 마십시오.',
        articles: '아래 각 조문',
        rules: '## 배치 근거 규칙',
        evidence:
          '- 표 데이터 행을 작성할 때는 검토 대상 원문 앞에 붙은 E0001 형식의 `근거 ID`를 사용하는 것을 권장합니다.',
        packEvidence:
          '- 아래 여러 조문을 한 번에 검토합니다. 표 데이터 행을 작성할 때는 문제가 있는 조문 원문 앞에 붙은 E0001 형식의 `근거 ID`를 사용하는 것을 권장합니다.',
        noCopy:
          '- 영문을 직접 복사하거나 번역·요약·말줄임표를 만들지 마십시오. 인용문은 하네스가 근거 ID에서 결정적으로 삽입합니다.',
        context:
          '- `보조 문맥`은 분석 참고용이며 근거 ID가 없으므로 인용 근거로 사용할 수 없습니다.',
        status: '## 검토 상태 블록 (패킹 표시용)',
        statusAdvice:
          '출력 마지막에 아래 형식으로 각 조문의 상태를 한 줄씩 기록하는 것을 권장합니다.',
        statusValue: '이슈 없음 또는 이슈 N건',
        crossChecks: [
          '- 참조된 조문·정의가 검토 대상 원문이나 보조 문맥에 없다는 사실 자체는 결함이 아닙니다. 결함으로 보고하지 마십시오.',
          '- 원문만으로 확정할 수 없는 교차참조 사안은 유형을 `교차확인필요`로 표시하십시오. 이런 항목은 후속 교차 검토 단계로 전달됩니다.',
        ],
      },
      en: {
        omitted:
          '[Some supplementary context was omitted due to the budget limit. Do not make definitive claims about matters whose source text you could not inspect.]',
        referencesOmitted:
          '[Some references or defined terms were not included in the supplementary context due to path restrictions, count limits, or missing files.]',
        sourceOmitted:
          '[The rest of this supplementary source was omitted due to the length limit.]',
        map: 'Document map',
        terms: 'Defined terms used',
        references: 'Directly referenced articles',
        parent: 'Parent chapter',
        noRows: 'If there are no issues, do not create data rows.',
        articles: 'each article below',
        rules: '## Batch evidence rules',
        evidence: `- When writing table data rows, it is recommended to use the \`${noteFormat('evidence', 'en')}\` in E0001 format prefixed to the source under review.`,
        packEvidence: `- Review the multiple articles below together. When writing table data rows, it is recommended to use the \`${noteFormat('evidence', 'en')}\` in E0001 format prefixed to the source of the article with the issue.`,
        noCopy:
          '- Do not copy the English text directly, translate it, summarize it, or use ellipses. The harness deterministically inserts quotations from the evidence IDs.',
        context:
          '- `Supplementary context` is for analysis only and has no evidence IDs, so it cannot be used as quotation evidence.',
        status: '## Review status block (for pack display)',
        statusAdvice:
          'At the end of the output, it is recommended to record one status line per article in the following format.',
        statusValue: 'No issues or N issues',
        crossChecks: [
          '- The absence of a referenced article or definition from the source under review or supplementary context is not itself a defect. Do not report it as a defect.',
          `- For cross-reference matters that cannot be established from the source alone, mark the type as \`${noteFormat('crossCheck', 'en')}\`. These items are passed to a subsequent cross-review phase.`,
        ],
      },
    },
    locale,
  )
}
