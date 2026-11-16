import { explicitlyRetargetsCurrentFile } from './agentSourcePolicy'

/** Keep caller-owned Korean compatibility patterns, with bounded English input. */
export function summary(request: string, legacy: RegExp): boolean {
  return /\p{Script=Hangul}/u.test(request)
    ? legacy.test(request)
    : /\b(?:summary|summari[sz](?:e|ing|ation))\b/i.test(request)
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
