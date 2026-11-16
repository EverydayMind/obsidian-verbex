import { L } from '../../i18n/modelText'

import type { BrowserHold } from './browserContext'
export function browserHoldLabel(hold?: BrowserHold): string {
  if (!hold)
    return L({
      ko: '작업이 보류됨 — Web Hands에서 사람이 계속해야 함',
      en: `Task paused — a human must continue in Web Hands`,
    })
  if (hold.reason === 'auth_required')
    return hold.authWindow === 'open'
      ? L({
          ko: '인증 창 열림 — 로그인 후 창을 닫고 Web Hands에서 계속을 선택하세요',
          en: `Authentication window open — sign in, close it, then choose Continue in Web Hands`,
        })
      : L({
          ko: '인증 창 닫힘 — Web Hands에서 계속을 선택해야 작업을 재개합니다',
          en: `Authentication window closed — choose Continue in Web Hands to resume`,
        })
  return hold.reason === 'stopped'
    ? L({
        ko: '작업 중지됨 — Web Hands에서 사람이 계속해야 함',
        en: `Task stopped — a human must continue in Web Hands`,
      })
    : L({
        ko: '사람 인계 중 — Web Hands에서 사람이 계속해야 함',
        en: `Human handoff in progress — a human must continue in Web Hands`,
      })
}
