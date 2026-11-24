import { LLMProvider } from '../../types/provider.types'

export type LocalizedText = {
  readonly ko: string
  readonly en: string
}

export type ReasoningEffortValue =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export type RecommendedField<T> =
  | { readonly value: T }
  | { readonly unset: true }

export type ModelProfileFieldKey =
  | 'toolTurnReasoningEffort'
  | 'selectionReasoningEffort'
  | 'selectionTimeoutSec'
  | 'openRouterProviderOrder'
  | 'openRouterAllowFallbacks'
  | 'openRouterReasoningMaxTokens'
  | 'contextWindow'
  | 'extraInstructions'

export type ModelProfileRecommended = {
  readonly toolTurnReasoningEffort?: RecommendedField<ReasoningEffortValue>
  readonly selectionReasoningEffort?: RecommendedField<ReasoningEffortValue>
  readonly selectionTimeoutSec?: RecommendedField<number>
  readonly openRouterProviderOrder?: RecommendedField<readonly string[]>
  readonly openRouterAllowFallbacks?: RecommendedField<boolean>
  readonly openRouterReasoningMaxTokens?: RecommendedField<number>
  readonly contextWindow?: RecommendedField<number>
  readonly extraInstructions?: RecommendedField<LocalizedText>
}

export type ModelProfileCaveat = {
  readonly id: string
  readonly text: LocalizedText
  readonly displayInCard?: boolean
}

export type ModelProfileEvidence = {
  readonly summary: LocalizedText
  readonly docPaths: readonly string[]
}

export type ModelProfile = {
  readonly id: string
  readonly providerType: LLMProvider['type']
  readonly model: string
  readonly recommended: ModelProfileRecommended
  readonly reasons: Partial<Record<ModelProfileFieldKey, LocalizedText>>
  readonly caveats: readonly ModelProfileCaveat[]
  readonly evidence: ModelProfileEvidence
  readonly checkedAt: string
}

const CONTEXT_WINDOW_1M = 1_048_576

const L = (text: LocalizedText): LocalizedText => text

const QWEN_EXTRA_INSTRUCTIONS: LocalizedText = L({
  ko: [
    '- 요청한 일을 마치면 결과만 답하고 끝냅니다. 답 끝에 후속 작업을 제안하거나 "원하시면 …할까요?", "…해 드릴까요?" 같은 질문을 붙이지 않습니다. 사용자가 더 원하면 다음 요청으로 말합니다.',
    '- 사용자가 지정한 대상과 범위만 바꿉니다. 비슷한 다른 곳을 함께 고치지 않습니다.',
    '- 한국어로 답하고 한자나 영어 낱말을 섞지 않습니다. 파일 이름·도구 이름·고유명사는 그대로 씁니다.',
  ].join('\n'),
  en: [
    '- Once the requested task is complete, provide only the result and stop. Do not suggest follow-up work or append questions such as "Would you like me to...?" at the end. The user will ask in the next message if they want more.',
    '- Modify only the target and scope specified by the user. Do not edit other similar places.',
    '- Answer in English and do not mix in words from other languages. Keep file names, tool names, and proper nouns as written.',
  ].join('\n'),
})

const NANO_SHARED: Omit<ModelProfile, 'id' | 'providerType' | 'model'> = {
  recommended: {
    toolTurnReasoningEffort: { value: 'low' },
  },
  reasons: {
    toolTurnReasoningEffort: L({
      ko: '추론 없음 43% → low 63%로 개선되며 소요 시간 증가는 +5% 수준입니다(medium 78%, +50%).',
      en: 'Improves pass rate from 43% (none) to 63% (low) with +5% latency (medium reaches 78% at +50% latency).',
    }),
  },
  caveats: [],
  evidence: {
    summary: L({
      ko: '추론 없음 43% → low 63% → medium 78%, 시간 +5%·+50%',
      en: 'None 43% -> low 63% -> medium 78%; latency +5% / +50%.',
    }),
    docPaths: ['docs/plans/nano-reliability-2026-11-17.md'],
  },
  checkedAt: '2026-11-18',
}

export const MODEL_PROFILES: readonly ModelProfile[] = [
  {
    id: 'openrouter:google/gemma-4-31b-it',
    providerType: 'openrouter',
    model: 'google/gemma-4-31b-it',
    recommended: {},
    reasons: {},
    caveats: [],
    evidence: {
      summary: L({
        ko: '45개 시나리오 93%(42/45) 통과',
        en: 'Passed 93% (42/45) of scenarios with default settings.',
      }),
      docPaths: ['docs/plans/model-evaluation-inkling-2-mini-2026-11-24.md'],
    },
    checkedAt: '2026-11-24',
  },
  {
    id: 'openrouter:openai/gpt-5.4-nano',
    providerType: 'openrouter',
    model: 'openai/gpt-5.4-nano',
    ...NANO_SHARED,
  },
  {
    id: 'openai:gpt-5.4-nano',
    providerType: 'openai',
    model: 'gpt-5.4-nano',
    ...NANO_SHARED,
  },
  {
    id: 'openrouter:thinkingmachines/inkling-2-mini',
    providerType: 'openrouter',
    model: 'thinkingmachines/inkling-2-mini',
    recommended: {
      toolTurnReasoningEffort: { value: 'low' },
      selectionReasoningEffort: { value: 'low' },
      openRouterProviderOrder: { value: ['io-net'] },
      openRouterAllowFallbacks: { unset: true },
      contextWindow: { value: CONTEXT_WINDOW_1M },
    },
    reasons: {
      toolTurnReasoningEffort: L({
        ko: '기본 추론(high)은 출력 상한 소진과 지연이 생겨 low로 낮추면 통과율이 오릅니다.',
        en: 'Default high reasoning can exhaust output tokens and add delay; low improves pass rate.',
      }),
      selectionReasoningEffort: L({
        ko: '첫 턴 Skill/Workflow 선택 호출의 지연(최대 17초)을 줄입니다.',
        en: 'Reduces first-turn Skill/Workflow selection delay (up to 17s).',
      }),
      openRouterProviderOrder: L({
        ko: 'PrimeIntellect가 계획한 도구 인자를 빠뜨리는 반복 오류(19/33)가 있어 io-net(0/33)을 우선합니다.',
        en: 'PrimeIntellect drops planned tool arguments (19/33 repeat failures vs 0/33 on io-net); prioritize io-net.',
      }),
      openRouterAllowFallbacks: L({
        ko: '넘어가기 허용을 끄면 Io Net이 지원하지 않는 tool_choice: required 요청이 404로 실패합니다.',
        en: 'Disallowing fallbacks causes 404 on tool_choice: required requests unsupported by io-net.',
      }),
      contextWindow: L({
        ko: '모델의 실제 문맥 창(1,048,576 토큰)에 맞춰 불필요한 분할 요약을 줄입니다.',
        en: 'Matches the model context window (1,048,576 tokens) to avoid unnecessary map-reduce splitting.',
      }),
    },
    caveats: [
      {
        id: 'inkling-disallow-fallbacks',
        text: L({
          ko: 'inkling-2-mini에서 다른 공급자로 넘어가기를 "허용 안 함"으로 두면 Io Net이 지원하지 않는 tool_choice: required 요청이 404로 실패하는 것이 확인됐습니다.',
          en: 'On inkling-2-mini, disallowing provider fallbacks is confirmed to return 404 on tool_choice: required requests unsupported by io-net.',
        }),
      },
    ],
    evidence: {
      summary: L({
        ko: '기본 78% → 94%. PrimeIntellect 인자 누락 반복 19/33 대 io-net 0/33, 넘어가기 금지 시 404',
        en: 'Baseline 78% -> 94%. PrimeIntellect dropped args 19/33 vs io-net 0/33; disallowing fallbacks returns 404.',
      }),
      docPaths: ['docs/plans/model-evaluation-inkling-2-mini-2026-11-24.md'],
    },
    checkedAt: '2026-11-24',
  },
  {
    id: 'openrouter:qwen/qwen3.8-flash',
    providerType: 'openrouter',
    model: 'qwen/qwen3.8-flash',
    recommended: {
      toolTurnReasoningEffort: { unset: true },
      openRouterReasoningMaxTokens: { value: 1024 },
      selectionReasoningEffort: { value: 'none' },
      selectionTimeoutSec: { value: 20 },
      extraInstructions: { value: QWEN_EXTRA_INSTRUCTIONS },
      contextWindow: { value: CONTEXT_WINDOW_1M },
    },
    reasons: {
      toolTurnReasoningEffort: L({
        ko: '도구 턴 추론 노력을 지정하면 OpenRouter 추론 객체가 생략되고, 이 모델은 low를 무시합니다.',
        en: 'Setting tool-turn reasoning effort suppresses the OpenRouter reasoning object, and this model ignores low.',
      }),
      openRouterReasoningMaxTokens: L({
        ko: '추론 길이를 1024 토큰으로 제한해 지연과 출력 잘림을 줄이면서 도구 사용을 유지합니다.',
        en: 'Caps reasoning at 1024 tokens to cut latency and truncation while keeping tool calls reliable.',
      }),
      selectionReasoningEffort: L({
        ko: '선택 호출 추론을 꺼 첫 메시지 표시 지연을 줄입니다(9~12초 → 3.3초).',
        en: 'Disables selection-call reasoning to cut first-message latency (9-12s -> 3.3s).',
      }),
      selectionTimeoutSec: L({
        ko: '선택 호출이 20초를 넘으면 키워드 선택으로 넘어가 긴 대기를 막습니다.',
        en: 'Falls back to keyword selection after 20 seconds to prevent long waits.',
      }),
      extraInstructions: L({
        ko: '답 끝 후속 제안(23~29%), 범위 밖 수정, 외국어 혼용을 줄입니다.',
        en: 'Reduces unsolicited end-of-answer suggestions (23-29%), out-of-scope edits, and mixed languages.',
      }),
      contextWindow: L({
        ko: '모델의 실제 문맥 창(1,048,576 토큰)에 맞춰 불필요한 분할 요약을 줄입니다.',
        en: 'Matches the model context window (1,048,576 tokens) to avoid unnecessary map-reduce splitting.',
      }),
    },
    caveats: [
      {
        id: 'qwen-low-ignored',
        text: L({
          ko: 'qwen3.8-flash는 최상위 reasoning_effort의 low를 무시합니다(기본 추론과 동일). 대신 추론 길이 상한(1024)을 사용하세요.',
          en: 'qwen3.8-flash ignores top-level reasoning_effort: low (behaves like default reasoning). Use Reasoning max tokens (1024) instead.',
        }),
      },
      {
        id: 'qwen-reasoning-disabled',
        text: L({
          ko: 'qwen3.8-flash의 도구 턴 추론을 끄면(none 또는 추론 사용 끄기) 도구 사용이 무너지는 것이 확인됐습니다.',
          en: 'Disabling tool-turn reasoning (none or Reasoning enabled: Disable) on qwen3.8-flash is confirmed to break tool usage.',
        }),
      },
    ],
    evidence: {
      summary: L({
        ko: '기본 71~78% → 96·93%(44·42/45). low 무시, 추론 끄면 도구 붕괴, 답 끝 제안 23~29%',
        en: 'Baseline 71-78% -> 96% / 93% (44 / 42 of 45). Ignores low; disabling reasoning breaks tools; 23-29% end with suggestions.',
      }),
      docPaths: ['docs/plans/model-evaluation-qwen3.8-flash-2026-11-25.md'],
    },
    checkedAt: '2026-11-25',
  },
  {
    id: 'openrouter:upstage/solar-pro4',
    providerType: 'openrouter',
    model: 'upstage/solar-pro4',
    recommended: {},
    reasons: {},
    caveats: [
      {
        id: 'solar-known-weaknesses',
        displayInCard: true,
        text: L({
          ko: '알려진 약점: 하지 않은 변경을 했다고 답하거나 도구 수치를 옮기다 틀리는 경우가 있습니다. Upstage 공급자의 깨진 도구 인자 JSON(400)은 하네스 보완이 반영됐습니다. 백업 모델로 권장합니다.',
          en: 'Known weaknesses: may claim unmade edits or misquote tool numbers. Malformed tool-argument JSON (400) from Upstage is mitigated by the harness. Recommended as a backup model.',
        }),
      },
    ],
    evidence: {
      summary: L({
        ko: '68회 중 49(Gemma4 61), 하네스 보완 뒤 한국어 35개 중 29. 백업 모델',
        en: '49/68 (Gemma4 61); 29/35 Korean scenarios after harness mitigations. Backup model.',
      }),
      docPaths: [
        'docs/plans/model-comparison-solar-pro4-2026-11-13.md',
        'docs/plans/solar-reliability-harness-2026-11-14.md',
      ],
    },
    checkedAt: '2026-11-17',
  },
]

export function normalizeModelNameForProfile(modelName: string): string {
  const trimmed = modelName.trim().toLowerCase()
  const colonIdx = trimmed.indexOf(':')
  return colonIdx === -1 ? trimmed : trimmed.slice(0, colonIdx)
}

const PROFILE_INDEX = new Map<string, ModelProfile>(
  MODEL_PROFILES.map((profile) => [
    `${profile.providerType}::${normalizeModelNameForProfile(profile.model)}`,
    profile,
  ]),
)

export function lookupModelProfile(
  providerType: LLMProvider['type'],
  modelName: string,
): ModelProfile | undefined {
  const normalized = normalizeModelNameForProfile(modelName)
  if (!normalized) return undefined
  return PROFILE_INDEX.get(`${providerType}::${normalized}`)
}

export function hasRecommendedSettings(profile: ModelProfile): boolean {
  return Object.keys(profile.recommended).length > 0
}
