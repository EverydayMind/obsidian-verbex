import { L } from '../../i18n/modelText'

import { suggestBindings } from './bindingSuggestions'
import { profileSummary } from './note'
import { derivationDigest } from './schema'
import type { ProfileMachine } from './types'

type NextStep = {
  tool: string
  arguments?: Record<string, unknown>
  then?: { tool: string; arguments: Record<string, unknown> }
  note: string
}

/**
 * The summary view (value and read paths) plus `nextStep`: the next tool on the path from a measured
 * sample to a linked, derived template, with every argument the profile
 * already determines filled in from saved state (sample path and hash, note
 * hash, revision). Placeholders in angle brackets are the only values the
 * model still chooses. This states facts about the profile; it does not
 * judge or change any output.
 */
export async function profileSummaryView(
  base: { noteSha256: string; revision: number },
  machine: ProfileMachine,
  args: { profile_path?: unknown },
) {
  const profilePath = String(args.profile_path)
  const summary = { ...base, ...profileSummary(machine) }
  const value =
    machine.schema === 'report-style-profile/1'
      ? {
          ...summary,
          nextStep: await profileNextStep(
            machine,
            profilePath,
            base.noteSha256,
          ),
        }
      : summary
  return [value, [profilePath]] as [unknown, string[]]
}

/**
 * How the draft must start its paragraphs to reach the bound prefix rules:
 * each rule matches a plain Markdown paragraph beginning with the token, and
 * `-`/`*`/`+` must be escaped or Markdown turns the line into a list.
 */
function draftPrefixNote(machine: ProfileMachine): string {
  const tokens = machine.bindings
    .map((binding) => binding.marker)
    .filter((marker) => !/^[A-Za-z]/.test(marker))
  if (!tokens.length) return ''
  const escaped = tokens.filter((token) => /^[-*+]$/.test(token))
  return L({
    ko: ` 초안의 개조식 문단은 ${tokens.map((token) => `"${token} "`).join('·')}으로 시작하는 일반 문단으로 써야 그 기호의 서식과 위 여백이 적용된다(Markdown 목록으로 쓰지 않는다)${escaped.length ? `. ${escaped.map((token) => `"${token} "`).join('·')}은 목록이 되지 않게 "\\${escaped[0]} "처럼 역슬래시를 붙인다` : ''}.`,
    en: ` Write the draft’s bullet-style paragraphs as plain paragraphs starting with ${tokens.map((token) => `"${token} "`).join('·')} to apply that symbol’s formatting and leading spacing (do not use Markdown lists)${escaped.length ? `. Escape ${escaped.map((token) => `"${token} "`).join('·')} with a backslash, as in "\\${escaped[0]} ", to prevent a list` : ''}.`,
  })
}

export async function profileNextStep(
  machine: ProfileMachine,
  profilePath: string,
  noteSha256: string,
): Promise<NextStep> {
  if (machine.template) {
    return {
      tool: 'plg__md-to-hwpx__export_note',
      arguments: {
        path: L({
          ko: '<조사한 근거로 새로 쓴 Markdown 초안 경로>',
          en: '<path to a new Markdown draft based on researched evidence>',
        }),
        template: machine.template.path,
        expected_template_sha256: machine.template.sha256,
      },
      note: L({
        ko: `연결된 파생 템플릿으로 내보낸다. 먼저 check_export에 같은 template을 넣어 시험한다. 템플릿 목록의 첫 템플릿으로 대신하지 않는다.${draftPrefixNote(machine)}`,
        en: `Export using the linked derived template. First test with the same template in check_export. Do not substitute the first template in the template list.${draftPrefixNote(machine)}`,
      }),
    }
  }
  if (machine.snapshot.source.format !== 'hwpx') {
    return {
      tool: 'save_style_profile',
      note: L({
        ko: 'HWP5 측정본으로는 템플릿을 파생할 수 없다. 사람이 준비한 HWPX 사본을 새로 측정한다.',
        en: 'A template cannot be derived from an HWP5 measurement. Measure a human-prepared HWPX copy afresh.',
      }),
    }
  }
  if (!machine.bindings.some((binding) => binding.marker === 'BODY')) {
    const suggested = suggestBindings(machine.snapshot)
    return {
      tool: 'update_style_profile',
      arguments: {
        profile_path: profilePath,
        expected_revision: machine.revision,
        expected_note_sha256: noteSha256,
        operation: 'set_bindings',
        bindings: suggested.length
          ? suggested
          : [
              {
                key: 'body',
                marker: 'BODY',
                representativeRef: L({
                  ko: '<semantic 보기에서 고른 본문 문단 ref>',
                  en: '<body paragraph ref chosen from the semantic view>',
                }),
                assignedBy: 'model',
              },
            ],
        // set_bindings replaces both lists; keep the saved fixed regions.
        fixed_regions: machine.fixedRegions,
      },
      note: suggested.length
        ? L({
            ko: '측정값에서 제안한 바인딩이다: 기호 없는 문단(BODY), 접두 기호(□·ㅇ·※·- 등)별 규칙, 번호 제목(H1)마다 그 위 빈 문단이 최빈값인 문단을 대표로 골랐다(요약 spacing.byPrefix). 대표 문단 바로 위의 빈 문단은 파생 템플릿에서 그 역할의 모든 문단 앞에 재현되고, SPACE:<역할>:<앞 항목> 바인딩은 그 앞 항목 뒤에서만 다른 빈 문단을 쓴다. 역할이 다르면 read_style_profile(view=semantic)으로 확인해 바꾼 뒤 호출하고, 다른 marker는 get_export_options의 marker catalog 이름으로 함께 넣는다.',
            en: 'These bindings are suggested from measurements: for plain paragraphs (BODY), each prefix symbol (□·ㅇ·※·-, etc.), and numbered headings (H1), the representative paragraph has the most common empty-paragraph sequence above it (summary spacing.byPrefix). The derived template reproduces the empty paragraphs directly above the representative before every paragraph of that role; SPACE:<role>:<previous item> bindings use different empty paragraphs only after that preceding item. If the role differs, inspect it with read_style_profile(view=semantic), change it, and then call; include other markers using names from the get_export_options marker catalog.',
          })
        : L({
            ko: 'BODY 바인딩이 있어야 템플릿을 파생할 수 있다. read_style_profile(view=semantic)에서 본문 문단의 ref를 고른다: candidates 1순위가 BODY_PARAGRAPH이거나(개조식이면 □·ㅇ 같은 기호로 시작하는 BULLET_ITEM) container가 body인 문단이며, SECTION_HEADING·ITEM_HEADING 같은 번호 제목이나 표 셀(container=cell) 문단은 아니다. 대표 문단 바로 위의 빈 문단(여백용)은 파생 템플릿에서 그 역할의 모든 문단 앞에 재현되므로, 위 빈 문단이 전형적인 문단을 고른다(요약의 spacing 참조). 제목 등 다른 marker는 get_export_options의 marker catalog 이름으로 함께 넣는다.',
            en: 'A BODY binding is required to derive a template. Choose a body paragraph ref in read_style_profile(view=semantic): a paragraph whose top candidate is BODY_PARAGRAPH (or BULLET_ITEM starting with a symbol such as □·ㅇ for bullet-style text), or whose container is body; not a numbered heading such as SECTION_HEADING or ITEM_HEADING, or a table-cell paragraph (container=cell). The derived template reproduces the empty paragraphs directly above the representative (for spacing) before every paragraph of that role, so choose a paragraph with typical empty paragraphs above it (see spacing in the summary). Include other markers, such as headings, using names from the get_export_options marker catalog.',
          }),
    }
  }
  return {
    tool: 'plg__md-to-hwpx__derive_template',
    arguments: {
      sample_path: machine.sourcePath,
      expected_sample_sha256: machine.snapshot.source.sha256,
      profile_path: profilePath,
      expected_profile_sha256: noteSha256,
      output_path: L({
        ko: '<get_export_options 템플릿 폴더>/<새 템플릿 이름>.hwpx',
        en: '<get_export_options template folder>/<new template name>.hwpx',
      }),
    },
    then: {
      tool: 'update_style_profile',
      arguments: {
        profile_path: profilePath,
        expected_revision: machine.revision,
        expected_note_sha256: noteSha256,
        operation: 'link_template',
        template_path: L({
          ko: '<derive_template의 output_path>',
          en: '<output_path from derive_template>',
        }),
        expected_template_sha256: L({
          ko: '<저장된 파생 템플릿의 SHA-256>',
          en: '<SHA-256 of the saved derived template>',
        }),
        expected_derivation_sha256: await derivationDigest(machine),
      },
    },
    note: L({
      ko: '샘플에서 새 템플릿을 파생한 뒤 프로파일에 연결한다. 해시는 위 값을 그대로 쓰고 추측하거나 사용자에게 묻지 않는다.',
      en: 'Derive a new template from the sample, then link it to the profile. Use the hash values above verbatim; do not guess or ask the user for them.',
    }),
  }
}
