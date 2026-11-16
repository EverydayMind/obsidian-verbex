import { L } from '../i18n/modelText'
import type { TurnRecord } from '../runstate/turnLedger'

type StyleProfileReceipt = NonNullable<
  TurnRecord['toolCalls'][number]['reportStyleReceipt']
>

const MAX_STYLE_PROFILES = 5

/**
 * The latest host receipt per report style profile note that an earlier turn
 * of this conversation saved or updated, newest profile first. Receipts are
 * host facts recorded when the change was applied; a failed or rejected call
 * leaves none.
 */
export function styleProfileReceipts(
  turns: readonly TurnRecord[],
): StyleProfileReceipt[] {
  const latest = new Map<string, StyleProfileReceipt>()
  for (const turn of turns)
    for (const call of turn.toolCalls) {
      const receipt = call.reportStyleReceipt
      if (!receipt) continue
      latest.delete(receipt.path)
      latest.set(receipt.path, receipt)
    }
  return [...latest.values()].reverse().slice(0, MAX_STYLE_PROFILES)
}

/**
 * Prompt section naming the style profiles this conversation already
 * measured, so a later turn reuses them instead of measuring the same sample
 * again, inventing a profile path or hash, or exporting with an unrelated
 * template (2026-11-03 session: turns 2–4 re-measured twice and passed a
 * made-up `__TEMP__.md` profile with a zero hash to derive_template while a
 * verified profile from turn 1 existed). Facts only; the model still decides.
 */
export function formatStyleProfiles(
  turns: readonly TurnRecord[],
  exposedTools: readonly string[],
): string | null {
  if (!exposedTools.includes('read_style_profile')) return null
  const receipts = styleProfileReceipts(turns)
  if (receipts.length === 0) return null
  return [
    L({
      ko: '이 대화에서 이미 측정·갱신한 서식 프로파일입니다(host 기록). 같은 샘플을 다시 측정하지 말고, 아래 경로로 read_style_profile(view=summary)을 호출해 그 결과의 nextStep을 그대로 따릅니다. revision·noteSha256은 갱신될 때마다 바뀌므로 도구 인자에는 최신 read 결과의 값을 넣고 추측하지 않습니다. 샘플 서식에 맞춘 내보내기는 이 프로파일에 연결된 파생 템플릿으로만 합니다.',
      en: `Format profiles already measured/updated in this conversation (host records). Do not measure the same sample again. Call read_style_profile(view=summary) with the paths below and follow its nextStep unchanged. revision/noteSha256 change with updates; use values from the latest read result in tool arguments, without guessing. Export matching sample formatting must use only the derived template linked to this profile.`,
    }),
    ...receipts.map((receipt) =>
      L({
        ko: `- \`${receipt.path}\`${
          receipt.readback === 'verified'
            ? ` revision ${receipt.revision}, noteSha256 ${receipt.noteSha256}`
            : ' (readback 미확인 — read_style_profile로 현재 값을 확인)'
        }${
          receipt.invalidatedTemplate
            ? ` — 연결됐던 템플릿 \`${receipt.invalidatedTemplate.path}\`은 해제됨(다시 파생·연결 필요)`
            : ''
        }`,
        en: `- \`${receipt.path}\`${receipt.readback === 'verified' ? ` revision ${receipt.revision}, noteSha256 ${receipt.noteSha256}` : ' (readback unconfirmed — check current values with read_style_profile)'}${receipt.invalidatedTemplate ? ` — previously linked template \`${receipt.invalidatedTemplate.path}\` was unlinked (derive and link again)` : ''}`,
      }),
    ),
  ].join('\n')
}
