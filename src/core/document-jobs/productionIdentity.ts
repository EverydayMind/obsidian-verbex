export type ProductionKey = {
  jobId: string
  draftPath: string
  draftSha256: string
  derivationSha256?: string
  templateSha256?: string
  outputPath: string
}
