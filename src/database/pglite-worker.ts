import { PGlite } from '@electric-sql/pglite'
import { worker } from '@electric-sql/pglite/worker'

// The worker file and the extension bundle are packaged next to main.js.
// PGliteWorker intentionally sends extensions-free options to this entrypoint
// because URL extensions are not supported on the client side of a worker.
void worker({
  init: async (options) =>
    PGlite.create({
      ...options,
      extensions: {
        vector: new URL(
          (
            globalThis as typeof globalThis & {
              __verbexPgliteVectorUrl?: string
            }
          ).__verbexPgliteVectorUrl ?? './vector.tar.gz',
          import.meta.url,
        ),
      },
    }),
})
