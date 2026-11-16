// @electric-sql/pglite publishes the worker subpath through package exports,
// which TypeScript's legacy `moduleResolution: node` does not inspect. Keep
// the source import on the public subpath while bridging its shipped types.
declare module '@electric-sql/pglite/worker' {
  export {
    LeaderChangedError,
    PGliteWorker,
    worker,
  } from '@electric-sql/pglite/dist/worker/index'
  export type {
    PGliteWorkerOptions,
    WorkerOptions,
  } from '@electric-sql/pglite/dist/worker/index'
}
