import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'
export const MAX_REPETITION_UNIT = 16
export const MIN_REPETITIONS = 64
export const MIN_REPETITION_LENGTH = 256
/** A whole line that keeps coming back, even when other lines between vary. */
export const MIN_REPEATED_LINE_LENGTH = 12
export const MIN_REPEATED_LINE_LETTERS = 4
export const MIN_LINE_REPETITIONS = 20
export const LINE_REPETITION_WINDOW = 4000
export const REPETITION_NOTICE = (locale: ModelLocale = getModelLocale()) =>
  L(
    {
      ko: '같은 토막이 반복되어 응답 생성을 중단했습니다. 다시 시도하거나 요청을 나눠 주세요.',
      en: `Response generation stopped because the same fragment repeated. Try again or split the request.`,
    },
    locale,
  )

/** Counts Unicode code points, retaining only the bounded suffix needed to detect a run. */
export class DegenerateRepetitionDetector {
  private tail: string[] = []
  private pendingHighSurrogate = ''
  private detected = false
  private position = 0
  private line: string[] = []
  private lineStarts = new Map<string, number[]>()

  /** Same line at least 20 times within the last 4,000 code points. */
  private endLine(): boolean {
    const text = this.line.join('').trim()
    this.line = []
    if (
      [...text].length < MIN_REPEATED_LINE_LENGTH ||
      (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) < MIN_REPEATED_LINE_LETTERS
    )
      return false
    const floor = this.position - LINE_REPETITION_WINDOW
    const starts = (this.lineStarts.get(text) ?? []).filter(
      (start) => start >= floor,
    )
    starts.push(this.position)
    this.lineStarts.set(text, starts)
    if (this.lineStarts.size > 512)
      for (const [key, value] of this.lineStarts)
        if (value[value.length - 1] < floor) this.lineStarts.delete(key)
    return starts.length >= MIN_LINE_REPETITIONS
  }

  add(chunk: string): boolean {
    if (this.detected) return true
    let input = this.pendingHighSurrogate + chunk
    this.pendingHighSurrogate = ''
    if (input.length && /[\uD800-\uDBFF]/.test(input[input.length - 1])) {
      this.pendingHighSurrogate = input[input.length - 1]
      input = input.slice(0, -1)
    }
    for (const character of input) {
      this.position++
      if (character === '\n') {
        if (this.endLine()) return (this.detected = true)
      } else if (this.line.length < 400) this.line.push(character)
      this.tail.push(character)
      if (this.tail.length > MAX_REPETITION_UNIT * MIN_REPETITIONS)
        this.tail.shift()
      for (let size = 1; size <= MAX_REPETITION_UNIT; size++) {
        const length =
          Math.max(MIN_REPETITIONS, Math.ceil(MIN_REPETITION_LENGTH / size)) *
          size
        if (this.tail.length < length) continue
        const start = this.tail.length - length
        const unit = this.tail.slice(start, start + size)
        if (!/[\p{L}\p{N}]/u.test(unit.join(''))) continue
        let matches = true
        for (let i = size; i < length; i++) {
          if (this.tail[start + i] !== unit[i % size]) {
            matches = false
            break
          }
        }
        if (matches) return (this.detected = true)
      }
    }
    return false
  }
}
