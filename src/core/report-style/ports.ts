import type { StyleApi } from './kordocStyleApi'
import type { ObservedDraftResult } from './observedBlockRead'

export type ReportStylePorts = {
  styleApi?: () => StyleApi
  readDerivationReport?: (
    path: string,
    sha256: string,
    signal?: AbortSignal,
  ) => Promise<unknown>
  validateMarkers?: (markers: string[], signal?: AbortSignal) => Promise<void>
  inspectExportBlocks?: (
    path: string,
    template: string,
    draftSha256: string,
    templateSha256: string,
    signal?: AbortSignal,
  ) => Promise<ObservedDraftResult>
}
