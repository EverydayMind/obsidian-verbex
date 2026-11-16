import { functionError, round } from './calculateErrors'
import * as calculationText from './calculationText'

class Parser {
  private pos = 0
  constructor(private input: string) {}
  private take(token: string): boolean {
    this.space()
    if (!this.input.startsWith(token, this.pos)) return false
    this.pos += token.length
    return true
  }
  private space(): void {
    while (/\s/.test(this.input[this.pos] ?? '')) this.pos++
  }
  private fail(message: string): never {
    const char = this.input[this.pos] ?? calculationText.endMarker()
    throw new Error(calculationText.parseFailure(message, this.pos, char))
  }
  parse(): number {
    const value = this.sum()
    this.space()
    if (this.pos !== this.input.length)
      this.fail(
        this.input[this.pos] === ','
          ? calculationText.thousandsError()
          : calculationText.trailingError(),
      )
    if (!Number.isFinite(value))
      throw new Error(calculationText.nonfiniteError())
    return value
  }
  private sum(): number {
    let value = this.product()
    for (;;) {
      if (this.take('+')) value += this.product()
      else if (this.take('-')) value -= this.product()
      else return value
    }
  }
  private product(): number {
    let value = this.unary()
    for (;;) {
      if (this.take('*')) value *= this.unary()
      else if (this.take('/')) {
        const divisor = this.unary()
        if (divisor === 0) throw new Error(calculationText.zeroDivisorError())
        value /= divisor
      } else return value
    }
  }
  private unary(): number {
    return this.take('-') ? -this.unary() : this.power()
  }
  private power(): number {
    const value = this.primary()
    return this.take('^') ? value ** this.unary() : value
  }
  private primary(): number {
    if (this.take('(')) {
      const value = this.sum()
      if (!this.take(')')) this.fail(calculationText.unclosedError())
      return value
    }
    this.space()
    const rest = this.input.slice(this.pos)
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)
    if (number) {
      this.pos += number[0].length
      return Number(number[0])
    }
    const name = /^[a-z_]+/i.exec(rest)?.[0]
    if (!name) this.fail(calculationText.expectedValueError())
    this.pos += name.length
    if (!this.take('(')) this.fail(calculationText.functionParenError())
    const values: number[] = []
    if (!this.take(')')) {
      do {
        values.push(this.sum())
      } while (this.take(','))
      if (!this.take(')')) this.fail(calculationText.unclosedFunctionError())
    }
    return call(name.toLowerCase(), values)
  }
}

function call(name: string, v: number[]): number {
  if (['sum', 'avg', 'min', 'max'].includes(name) && v.length >= 1) {
    if (name === 'min') return Math.min(...v)
    if (name === 'max') return Math.max(...v)
    const sum = v.reduce((a, b) => a + b, 0)
    return name === 'avg' ? sum / v.length : sum
  }
  if (name === 'abs' && v.length === 1) return Math.abs(v[0])
  if (name === 'sqrt' && v.length === 1 && v[0] >= 0) return Math.sqrt(v[0])
  if (
    name === 'round' &&
    (v.length === 1 || v.length === 2) &&
    Number.isInteger(v[1] ?? 0) &&
    (v[1] ?? 0) >= 0 &&
    (v[1] ?? 0) <= 10
  )
    return round(v[0], v[1] ?? 0)
  if (name === 'pct_change' && v.length === 2 && v[0] !== 0)
    return ((v[1] - v[0]) / Math.abs(v[0])) * 100
  if (name === 'share' && v.length === 2 && v[1] !== 0)
    return (v[0] / v[1]) * 100
  throw new Error(functionError(name))
}

export function calculate(expression: string): string {
  const value = new Parser(expression).parse()
  const normalized = Number(value.toPrecision(15))
  let text = `${expression} = ${Object.is(normalized, -0) ? 0 : normalized}`
  if (!Number.isInteger(value)) text += calculationText.displayValue(value)
  if (Math.abs(value) > 2 ** 53) text += calculationText.precisionLimit()
  return text
}
