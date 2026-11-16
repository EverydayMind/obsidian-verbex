const documentTypeAliases = [
  {
    expressions: [
      '한글 파일',
      '한글파일',
      '한글 문서',
      '한글문서',
      '아래아한글',
      'hangul file',
      'hangul document',
      'hancom hangul',
      'hancom document',
      'hanword document',
      'hangul documents',
      'hwp',
    ],
    resourceTypes: ['.hwp', '.hwpx'],
  },
] as const

export function requestedResourceTypes(requestText?: string): Set<string> {
  const text = requestText?.toLowerCase() ?? ''
  const types = new Set<string>()
  for (const alias of documentTypeAliases) {
    if (
      alias.expressions.some((expression) =>
        /^[a-z ]+$/.test(expression)
          ? new RegExp(
              `\\b${expression === 'hwp' ? 'hwpx?' : expression.replace(/\b(file|document)\b/g, '$1s?')}\\b`,
              'i',
            ).test(text)
          : text.includes(expression),
      )
    ) {
      for (const type of alias.resourceTypes) types.add(type)
    }
  }
  return types
}
