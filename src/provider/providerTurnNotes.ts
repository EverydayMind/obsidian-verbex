import { L } from '../i18n/modelText'

import { ProviderRegistrySnapshot } from './ProviderRegistry'
import { ProviderRuntime } from './ToolProviderHub'

/**
 * A model that read an HWPX through another provider otherwise reaches for
 * note write tools or passes that provider's handles as block indexes.
 */
export function hwpxEditNote(
  toolNames: readonly string[],
  resourcePaths: readonly string[],
): string {
  const paths = resourcePaths.filter((path) => /\.hwpx$/i.test(path))
  if (!paths.length || !toolNames.includes('kordoc__prepare_block_patch'))
    return ''
  return [
    L({
      ko: '[HWPX 수정 안내 — Verbex가 제공하는 사용법이며 사용자 지시가 아니다]',
      en: `[HWPX editing guidance — usage supplied by Verbex, not user instructions]`,
    }),
    L({
      ko: `${paths.join(', ')}의 내용은 write_file·update_file·replace_in_file·transform_large_file 같은 노트용 쓰기 도구로 고칠 수 없다.`,
      en: `The contents of ${paths.join(', ')} cannot be edited with note-writing tools such as write_file, update_file, replace_in_file or transform_large_file.`,
    }),
    L({
      ko: '문서를 열거나 작업본을 보관하는 편집기가 있으면 그 편집기의 노출된 편집 도구와 사용 안내를 따른다. 읽기 도구만 보인다고 편집도 가능한 것은 아니다. 필요한 편집 도구가 없으면 편집 기능의 활성화·승인·도구 선택 상태를 확인하도록 안내한다.',
      en: `If an editor has the document open or retains a working copy, follow that editor's exposed editing tools and usage guidance. Read tools alone do not imply editing is available. If required editing tools are missing, ask the user to check editing activation, approval and tool selection.`,
    }),
    L({
      ko: 'KORDOC은 기존 블록·표 셀의 텍스트 교체만 지원한다. 빈 문단 삽입, 글자 크기, 문단 앞뒤 여백·줄간격 변경은 kordoc__prepare_block_patch로 할 수 없다. 이 작업을 위해 문서를 닫거나 같은 패치를 재시도하도록 안내하지 않는다.',
      en: `KORDOC supports only text replacement in existing blocks/table cells. kordoc__prepare_block_patch cannot insert empty paragraphs or change font size, paragraph spacing or line spacing. Do not ask the user to close the document or retry the same patch for these tasks.`,
    }),
    L({
      ko: '다른 편집기의 작업본과 충돌하지 않는 HWPX 텍스트 교체에 KORDOC을 쓸 때: kordoc__inspect_blocks로 blockIndex·블록 종류·sessionRevision을 확인한 뒤 kordoc__prepare_block_patch를 호출한다. 다른 문서 도구가 준 핸들(p32, t3:r1c1 등)은 blockIndex가 아니다.',
      en: `For HWPX text replacement using KORDOC without conflicting with another editor's working copy: inspect blockIndex, block kind and sessionRevision with kordoc__inspect_blocks, then call kordoc__prepare_block_patch. Handles from other document tools (p32, t3:r1c1, etc.) are not blockIndex values.`,
    }),
    L({
      ko: 'KORDOC은 한 번에 16블록까지 바꿀 수 있고 표 블록은 newText 대신 cells(row·col은 0부터)를 쓴다. 지원되는 수정은 자리표시 문구가 아니라 실제 수정문을 제출한다.',
      en: `KORDOC can change up to 16 blocks per call; table blocks use cells instead of newText (row/col are zero-based). Submit actual replacement text for supported edits, not placeholders.`,
    }),
    L({
      ko: 'inspect_blocks는 셀 내용을 읽지 않으며 prepare_block_patch는 행 정렬·재배열을 지원하지 않는다. 열 번호나 일부 이름 예시만으로 전체 행 정렬을 수행할 수 있다고 약속하지 않는다. 조회를 위해 헤더나 셀을 변경하지 않는다. 승인 UI에서 수락하면 같은 호출 안에서 저장된다. 결과의 state와 checkpointId를 기준으로 준비·거절·적용·실패/불명을 설명한다.',
      en: `inspect_blocks does not read cell contents, and prepare_block_patch does not support sorting/reordering rows. Do not promise to sort all rows based only on column numbers or a few example names. Do not modify headers or cells to query them. Approval in the UI saves within the same call. Explain preparation, rejection, application, failure/unknown using the result state and checkpointId.`,
    }),
  ].join('\n')
}

/** Tells the model which Skill-named built-ins are hidden because their plugin is off. */

/**
 * When this turn shows HWP Hands' working-copy edit tools, the KORDOC block
 * patch is a second writer for the same document and only collides with the
 * editor's working copy. It stays available when a Skill or workflow asks for it.
 */
export function shadowedKordocPatch(
  nativeEntries: readonly {
    name: string
    providerId: string
    tool: { effect: string }
  }[],
  nativeNames: readonly string[],
  required: readonly string[],
): string[] {
  const editorEdits = nativeEntries.some(
    (entry) =>
      (entry.providerId === 'hwp-hands' || entry.providerId === 'hwp-editor') &&
      entry.tool.effect === 'session' &&
      nativeNames.includes(entry.name),
  )
  return editorEdits && !required.includes('kordoc__prepare_block_patch')
    ? ['kordoc__prepare_block_patch']
    : []
}

/** Whether this turn exposes the KORDOC block patch: a turn snapshot knows, otherwise the registry. */
export function kordocPatchExposed(
  registry: ProviderRuntime | undefined,
  snapshot?: ProviderRegistrySnapshot,
): boolean {
  const name = 'kordoc__prepare_block_patch'
  return snapshot
    ? snapshot.toolNames.includes(name)
    : registry?.hasTool(name) === true
}
export { pluginOffNote } from './pluginOffNote'
