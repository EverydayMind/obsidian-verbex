import { canonicalToolName } from '../../core/tools/toolDefinitions'
import { L } from '../../i18n/modelText'

import type { AvailableExposureReason } from './exposureReasons'

export type SkillReservation = { skill: string; tools: readonly string[] }
export type ReservationResult = 'reserved' | 'budget' | 'not_ready' | 'excluded'
export type ReservationOutcome = {
  skill: string
  tools: string[]
  result: ReservationResult
}

/**
 * `preferred-tools` of the active Skills, in active-Skill order (plan v1.7
 * WP8(a), D6). Names are canonical and de-duplicated; a reservation is never a
 * requirement, so a missing tool never stops the request.
 */
export function skillReservations(
  skills: readonly { name?: string; preferredTools?: readonly string[] }[] = [],
): SkillReservation[] {
  return skills.flatMap((skill) => {
    const tools = [
      ...new Set((skill.preferredTools ?? []).map(canonicalToolName)),
    ]
    return tools.length ? [{ skill: skill.name ?? 'Skill', tools }] : []
  })
}

/**
 * Fact lines for the active reserving Skills: which declared tools this
 * request carries and why the others are absent. A fact, not an instruction
 * to call an absent tool (DECISIONS §12).
 */
export function reservationNote(
  outcomes: readonly ReservationOutcome[],
  exposedNames: readonly string[],
  reasons: readonly AvailableExposureReason[],
): string {
  const exposed = new Set(exposedNames)
  return outcomes
    .map((outcome) => {
      const shown = outcome.tools.filter((name) => exposed.has(name))
      const missing = outcome.tools
        .filter((name) => !exposed.has(name))
        .map(
          (name) =>
            `${name}(${reasons.find((item) => item.name === name)?.reason ?? 'not_ready'})`,
        )
      return [
        L({
          ko: `[호스트 사실: Skill 도구 예약] "${outcome.skill}"이 우선 확보를 선언한 도구 중 이번 요청에 노출된 것: ${shown.join(', ') || '없음'}(예약 결과: ${outcome.result}).`,
          en: `[Host fact: Skill tool reservation] Tools declared for priority reservation by "${outcome.skill}" that are exposed in this request: ${shown.join(', ') || 'none'} (reservation result: ${outcome.result}).`,
        }),
        ...(missing.length
          ? [
              L({
                ko: `노출되지 않은 것: ${missing.join(', ')}. 이 도구들은 이번 요청에서 호출할 수 없으므로 그 도구가 필요한 단계는 진행할 수 없다.`,
                en: `Not exposed: ${missing.join(', ')}. These tools cannot be called in this request, so steps requiring them cannot proceed.`,
              }),
            ]
          : []),
      ].join(' ')
    })
    .join('\n')
}
