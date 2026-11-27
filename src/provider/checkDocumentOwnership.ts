import type { Vault } from 'obsidian'

import { L } from '../i18n/modelText'

import type { DiagnosticSpan, InteropDiagnostics } from './interop/diagnostics'
import {
  type DocumentOwner,
  type OwnershipOptions,
  type OwnershipQueryResult,
  OwnershipUnverifiableError,
  ownershipKey as key,
} from './ownershipTypes'

export type OwnershipEnvironment = {
  vault?: Pick<Vault, 'adapter' | 'getAllLoadedFiles'>
  providerName?: (id: string) => string | undefined
}

/** Only observed working copies and disk/index absence authorize the narrow exception. */
export async function checkDocumentOwnership(input: {
  path: string
  writer: { kind: 'native'; providerId: string }
  options?: OwnershipOptions
  environment: OwnershipEnvironment
  trace?: DiagnosticSpan
  diagnostics?: InteropDiagnostics
  nativeDocuments: (
    except?: string,
    trace?: DiagnosticSpan,
  ) => Promise<DocumentOwner[] | OwnershipQueryResult>
  companionDocuments: (targetPath?: string) => Promise<string[]>
}): Promise<void> {
  const { path, writer, options, environment, trace, diagnostics } = input
  const target = key(path)
  const result = await input.nativeDocuments(writer.providerId, trace)
  const { documents, unverifiable } = Array.isArray(result)
    ? { documents: result, unverifiable: [] }
    : result
  const conflict = documents.find(
    (document) =>
      key(document.path) === target &&
      (document.hasView ||
        document.dirty ||
        document.heldForAgent.length > 0) &&
      document.providerId !== writer.providerId,
  )
  if (conflict)
    throw new Error(
      L({
        ko: `다른 플러그인이 이 문서의 작업본을 열거나 보관하고 있습니다: ${JSON.stringify({ path, providerId: conflict.providerId, hasView: conflict.hasView, dirty: conflict.dirty, heldForAgent: conflict.heldForAgent.length > 0 })}. 해당 편집기의 노출된 편집 도구를 사용하세요. 도구가 없으면 편집 기능의 활성화·승인·도구 선택 상태를 확인하세요. 다른 편집 경로로 전환할 때만 작업본을 안전하게 저장하고 소유권을 해제해야 합니다. 창을 닫아도 미저장·보관 중인 작업본은 남을 수 있습니다. 대상 경로는 유지하고, 현재 도구가 지원하지 않는 서식 작업을 재시도하지 마세요.`,
        en: `Another plugin has this document's working copy open or retained: ${JSON.stringify({ path, providerId: conflict.providerId, hasView: conflict.hasView, dirty: conflict.dirty, heldForAgent: conflict.heldForAgent.length > 0 })}. Use the exposed editing tools of that editor. If no tools are available, check whether editing is enabled, approved, and selected in the tools list. Safely save the working copy and release ownership only when switching to another editing path. Closing the window may leave unsaved or retained working copies. Keep the target path and do not retry formatting operations unsupported by the current tool.`,
      }),
    )
  if (
    (await input.companionDocuments(path)).some((item) => key(item) === target)
  )
    throw new Error(
      L({
        ko: '다른 문서 편집 화면에서 이 문서를 열거나 편집하고 있습니다. 그 화면의 작업을 마친 뒤 다시 요청하세요.',
        en: 'This document is open or being edited in another document editor view. Finish working in that view, then request again.',
      }),
    )
  if (options?.newOutput) {
    const vault = environment.vault
    if (!vault)
      throw new Error(
        L({
          ko: '새 출력 경로의 현재 상태를 확인할 수 없습니다.',
          en: 'Cannot verify the current state of the new output path.',
        }),
      )
    if (
      (await vault.adapter.exists(path)) ||
      vault.getAllLoadedFiles().some((item) => key(item.path) === target)
    )
      throw new Error(
        L({
          ko: '새 출력 경로에 파일 또는 폴더가 이미 있습니다. 새 경로를 선택하세요.',
          en: 'A file or folder already exists at the new output path. Choose a new path.',
        }),
      )
    for (const { providerId, cause } of unverifiable) {
      if (trace)
        trace.mark('ownership.unverifiable_new_output', {
          providerId,
          failureCategory: cause,
        })
      else
        diagnostics
          ?.begin('ownership', { providerId })
          .finish('ownership.unverifiable_new_output', {
            failureCategory: cause,
          })
    }
  } else if (unverifiable.length)
    throw new OwnershipUnverifiableError(unverifiable, environment.providerName)
}
