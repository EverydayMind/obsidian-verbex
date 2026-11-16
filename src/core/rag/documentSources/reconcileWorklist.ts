import { TFile } from 'obsidian'

export type ReconcileProgress = {
  completed: number
  total: number
  currentPath: string
}

/**
 * Resumable list of documents to reconcile. A slice stops once its wall-clock
 * budget is spent (after at least one document) so the caller can let other
 * background work run before continuing.
 */
export class ReconcileWorklist {
  private remaining: TFile[] | null = null
  readonly progress: ReconcileProgress = {
    completed: 0,
    total: 0,
    currentPath: '',
  }

  /** Returns true once no documents are left (or the queue is stopped). */
  async slice(
    list: () => TFile[],
    budgetMs: number,
    restart: boolean,
    step: (file: TFile) => Promise<void>,
    stopped: () => boolean,
  ): Promise<boolean> {
    if (restart || !this.remaining) {
      const files = list()
      this.remaining = files
      Object.assign(this.progress, {
        completed: 0,
        total: files.length,
        currentPath: '',
      })
    }
    const deadline = Date.now() + budgetMs
    while (this.remaining.length && !stopped()) {
      const file = this.remaining.shift() as TFile
      this.progress.currentPath = file.path
      await step(file)
      this.progress.completed++
      if (Date.now() >= deadline) break
    }
    if (this.remaining.length && !stopped()) return false
    this.remaining = null
    this.progress.currentPath = ''
    return true
  }
}
