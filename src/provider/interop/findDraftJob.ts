import type { App } from 'obsidian'

import type { FormatJob } from '../../core/document-jobs/jobTypes'

import { sameVaultFile } from './documentJobPathMatch'

export async function findDraftJob(app: App, jobs: FormatJob[], path: string) {
  const matches: FormatJob[] = []
  for (const job of jobs) {
    if (job.status.state !== 'ready') continue
    const same = await sameVaultFile(app, job.status.data.draftPath, path)
    if (same === undefined) return { ambiguous: true }
    if (same) matches.push(job)
  }
  return matches.length > 1
    ? { ambiguous: true }
    : { ambiguous: false, job: matches[0] }
}
