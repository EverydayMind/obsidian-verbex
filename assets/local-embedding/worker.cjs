'use strict'
const path = require('node:path')
const { pipeline, env } = require('@huggingface/transformers')
env.allowRemoteModels = false
env.allowLocalModels = true
env.localModelPath = path.join(__dirname, 'models')
env.useFSCache = false
let extractor
let queue = Promise.resolve()
const cancelled = new Set()
process.on('message', ({ id, texts, kind, cancel }) => {
  if (cancel !== undefined) {
    cancelled.add(cancel)
    return
  }
  queue = queue
    .then(async () => {
      if (cancelled.delete(id)) return
      extractor ||= await pipeline(
        'feature-extraction',
        'multilingual-e5-small',
        { dtype: 'fp16', device: 'cpu' },
      )
      const vectors = []
      for (const text of texts) {
        if (cancelled.delete(id)) return
        const result = await extractor(`${kind}: ${text}`, {
          pooling: 'mean',
          normalize: true,
        })
        vectors.push(Array.from(result.data))
      }
      if (!cancelled.delete(id)) process.send({ id, vectors })
    })
    .catch((error) =>
      process.send({ id, error: String(error?.message || error) }),
    )
})
