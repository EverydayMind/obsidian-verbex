import { L } from '../../i18n/modelText'
import { ProposedChange } from '../../verbex/types'
import { ChangeOutcome } from '../../workflow/StepExecutor'

export function summarizeBatchOutcomes(
  outcomes: ChangeOutcome[],
  limit = 5,
): { applied: number; total: number; detail: string } {
  const total = outcomes.length
  const applied = outcomes.filter((o) => o.status === 'applied').length
  const unapplied = outcomes.filter((o) => o.status !== 'applied')

  if (unapplied.length === 0) {
    return { applied, total, detail: '' }
  }

  const items = unapplied.slice(0, limit).map((o) => {
    let reasonText =
      o.reason ??
      o.error ??
      L({ ko: '(사유 없음)', en: '(no reason provided)' })
    reasonText = reasonText.replace(/\r?\n/g, ' ')
    if (reasonText.length > 160) {
      reasonText = reasonText.slice(0, 160) + '…'
    }
    return `- ${o.status}: ${o.change.path} — ${reasonText}`
  })

  let detail = items.join('\n')

  if (unapplied.length > limit) {
    detail += L({
      ko: `\n... 외 ${unapplied.length - limit}건`,
      en: `\n... and ${unapplied.length - limit} more`,
    })
  }

  const counts: Record<string, number> = {}
  for (const o of unapplied) {
    counts[o.status] = (counts[o.status] ?? 0) + 1
  }
  const countStr = Object.entries(counts)
    .map(([status, count]) => `${status} ${count}`)
    .join(', ')

  detail += L({
    ko: `\n(미적용 상태별 집계: ${countStr})`,
    en: `\n(Unapplied counts by status: ${countStr})`,
  })

  return { applied, total, detail }
}

export function verifyUniquePaths(changes: ProposedChange[]): void {
  const canonicalPathKey = (p: string) =>
    p.normalize('NFC').replace(/\\/g, '/').toLowerCase()

  const pathMap = new Map<string, ProposedChange[]>()
  for (const change of changes) {
    const key = canonicalPathKey(change.path)
    if (!pathMap.has(key)) {
      pathMap.set(key, [])
    }
    pathMap.get(key)!.push(change)
  }

  const duplicates = Array.from(pathMap.entries()).filter(
    ([_, list]) => list.length > 1,
  )
  if (duplicates.length > 0) {
    const dupCount = duplicates.length
    const limit = 5
    const items = duplicates.slice(0, limit).map(([_, list]) => {
      const ops = list.map((c) => c.op).join(', ')
      return `${list[0].path} (${ops})`
    })
    let dupListStr = items.join(', ')
    if (duplicates.length > limit) {
      dupListStr += L({
        ko: ` 외 ${duplicates.length - limit}건`,
        en: ` and ${duplicates.length - limit} more`,
      })
    }
    throw new Error(
      L({
        ko: `배치 중단: 동일 대상 경로 중복 ${dupCount}건 — ${dupListStr}. 어떤 파일도 변경하지 않았습니다.`,
        en: `Batch stopped: ${dupCount} duplicate target paths — ${dupListStr}. No files were changed.`,
      }),
    )
  }
}
