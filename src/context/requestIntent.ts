import { explicitlyRetargetsCurrentFile } from './agentSourcePolicy'

function unquote(request: string): string {
  let result = ''
  const pairs: Record<string, string> = {
    '"': '"',
    '‘': '’',
    '“': '”',
    '「': '」',
    '『': '』',
    "'": "'",
  }
  const latin = (c: string) => /[A-Za-z]/.test(c || ' ')
  for (let i = 0; i < request.length; i++) {
    const open = request[i],
      close = pairs[open]
    if (!close || (open === "'" && /[A-Za-z0-9]/.test(request[i - 1] || ' '))) {
      result += open
      continue
    }
    let end = i + 1
    while (end < request.length && end - i - 1 <= 80) {
      if (
        request[end] === close &&
        !(open === "'" && latin(request[end - 1]) && latin(request[end + 1]))
      )
        break
      end++
    }
    if (end < request.length && end - i - 1 <= 80) {
      result += ' '
      i = end
    } else result += open
  }
  return /\p{L}/u.test(result) ? result : request
}

/** Keep caller-owned Korean compatibility patterns, with bounded English input. */
export function summary(request: string, legacy: RegExp): boolean {
  const text = unquote(request)
  return /\p{Script=Hangul}/u.test(request)
    ? legacy.test(text)
    : /\b(?:summary|summari[sz](?:e|ing|ation))\b/i.test(text)
}

export function fileTarget(request: string, legacy: RegExp): boolean {
  return explicitlyRetargetsCurrentFile(request) || legacy.test(request)
}

export function extraSummaryWork(request: string, legacy: RegExp): boolean {
  if (/\p{Script=Hangul}/u.test(request)) return legacy.test(request)
  return /\b(?:other|multiple|several)\s+(?:documents?|notes?|files?)\b|\b(?:compare|comparison|search|find|investigate|verify|save|export|delete|remove|send|upload|modify|translate|and|then|tool|cross[- ]check|validate|look into|create|change|edit|revise|email|transmit|dispatch|download|publish|rewrite|convert)\b|\bwrite\s+to\b|\bwrite\b.{0,20}\b(?:file|note)\b/i.test(
    request,
  )
}
