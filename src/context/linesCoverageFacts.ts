import type { LinesCoverage } from '../core/tools/obsidianQueryLinesFacts'
import type { NotesCoverage } from '../core/tools/obsidianQueryNotesFacts'
import type { ReadFacts } from '../core/tools/readFacts'
import { L } from '../i18n/modelText'

export function linesCoverageItem(label: string, c: LinesCoverage): string[] {
  if (c.invalidated || (!c.cursor && !c.deliveryComplete))
    return [
      L({
        ko: `줄 조회 cursor 사용 불가: ${label} — 이전 결과와 합치지 말고 obsidian_query를 lines=true, restart=true로 다시 시작`,
        en: `Line query cursor unavailable: ${label} — do not merge previous results; restart obsidian_query with lines=true, restart=true`,
      }),
    ]
  if (c.scanComplete && c.deliveryComplete) return []
  return [
    L({
      ko: `줄 조회 미완료: ${label} 훑음 ${c.notesScanned}/${c.notesTotal}, 누적 ${c.linesDelivered}줄 — obsidian_query를 lines=true, 같은 조건과 cursor="${c.cursor}"로 이어 받기 (재시작 뒤 만료되면 새로 시작)`,
      en: `Line query incomplete: ${label} scanned ${c.notesScanned}/${c.notesTotal}, cumulative ${c.linesDelivered} lines — continue obsidian_query with lines=true, the same conditions and cursor="${c.cursor}" (if expired after restart, start again)`,
    }),
  ]
}

export function coverageItem(
  label: string,
  c: NonNullable<ReadFacts['coverage']>,
): string[] {
  if (c.mode === 'lines') return linesCoverageItem(label, c)
  if (c.mode === 'notes') return notesCoverageItem(label, c)
  if (c.state === 'complete') return []
  return c.state === 'partial' || c.state === 'interrupted'
    ? [
        L({
          ko: `전수 조회 미완료: ${label} coverage ${c.seen}/${c.total} (${c.state}) — exhaustive=true, cursor="${c.cursor}"로 이어서 호출 (재시작 뒤에는 만료되어 새로 시작)`,
          en: `Exhaustive query incomplete: ${label} coverage ${c.seen}/${c.total} (${c.state}) — continue with exhaustive=true, cursor="${c.cursor}" (expires after restart; start again then)`,
        }),
      ]
    : [
        L({
          ko: `전수 조회 cursor 사용 불가: ${label} ${c.state} — cursor 없이 exhaustive=true로 새로 시작`,
          en: `Exhaustive query cursor unavailable: ${label} ${c.state} — restart with exhaustive=true and no cursor`,
        }),
      ]
}

export function keepsLaterPage(
  previous: ReadFacts['coverage'],
  next: NonNullable<ReadFacts['coverage']>,
): boolean {
  if (
    !previous ||
    (previous.mode !== 'lines' && previous.mode !== 'notes') ||
    (next.mode !== 'lines' && next.mode !== 'notes') ||
    previous.mode !== next.mode ||
    next.invalidated
  )
    return false
  const session = (c: LinesCoverage | NotesCoverage) =>
    c.replayCursor.split('.')[0]
  const delivered = (c: LinesCoverage | NotesCoverage) =>
    c.mode === 'notes' ? c.notesDelivered : c.linesDelivered
  return (
    session(previous) === session(next) &&
    (previous.invalidated ||
      previous.deliveryComplete ||
      delivered(previous) > delivered(next) ||
      previous.notesScanned > next.notesScanned)
  )
}

function notesCoverageItem(label: string, c: NotesCoverage): string[] {
  if (c.invalidated || (!c.cursor && !c.deliveryComplete))
    return [
      L({
        ko: `노트 조회 cursor 사용 불가: ${label} — 이전 결과와 합치지 말고 obsidian_query를 lines=false, restart=true로 다시 시작`,
        en: `Note query cursor unavailable: ${label} — do not merge previous results; restart obsidian_query with lines=false, restart=true`,
      }),
    ]
  if (c.scanComplete && c.deliveryComplete) return []
  return [
    L({
      ko: `노트 조회 미완료: ${label} 훑음 ${c.notesScanned}/${c.notesTotal}, 누적 ${c.notesDelivered}개 — obsidian_query를 lines=false, 같은 조건과 cursor="${c.cursor}"로 이어 받기 (재시작 뒤 만료되면 새로 시작)`,
      en: `Note query incomplete: ${label} scanned ${c.notesScanned}/${c.notesTotal}, cumulative ${c.notesDelivered} notes — continue obsidian_query with lines=false, the same conditions and cursor="${c.cursor}" (if expired after restart, start again)`,
    }),
  ]
}
