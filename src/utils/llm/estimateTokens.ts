// Fast synchronous estimate for budget packing. It intentionally overestimates
// CJK-heavy text because cl100k tokenization often splits Korean/Han text into
// multiple tokens per visible character.
const CJK_CHAR_RE =
  /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/

export function estimateTokens(text: string): number {
  if (!text) {
    return 0
  }
  let cjkChars = 0
  for (const char of text) {
    if (CJK_CHAR_RE.test(char)) {
      cjkChars += 1
    }
  }
  const nonCjkChars = Math.max(text.length - cjkChars, 0)
  return Math.ceil(nonCjkChars / 4 + cjkChars * 2.5)
}
