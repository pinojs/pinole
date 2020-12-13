import { parentPort, workerData } from 'worker_threads'
import { once } from 'events'
import { promisify } from 'util'
import {
  SIZE, TIMEOUT, META_BLOCK, STATUS, MODE,
  POS, READY, WRITE, WRITING, ASYNC, SYNC
} from './constants.cjs'

const immediate = promisify(setImmediate)

const { shared, transport, opts, encoding } = workerData

export const worker = async () => {
  let createProcessor = await import(transport)
  createProcessor = createProcessor.default || createProcessor

  if (typeof createProcessor !== 'function') throw Error('processor must be a function')
  
  const processor = await createProcessor(opts)

  if (typeof processor !== 'function') throw Error('processor must return a function')

  const buffer = Buffer.from(shared)
  const meta = new Int32Array(shared)
  const data = buffer.slice(META_BLOCK)

  async function poll () {
    if (meta[STATUS] === READY || meta[POS] === 0) {
      await immediate()
      await poll()
    }
    if (meta[STATUS] === WRITE) {
      const mode = meta[MODE]
      meta[STATUS] = WRITING
      if (mode === SYNC) Atomics.notify(meta, STATUS)
      const pos = meta[POS]
      const chunk = Buffer.alloc(pos)
      data.copy(chunk, 0, 0, pos)
      await processor(chunk, encoding)
      data.fill(0)
      if (mode === ASYNC) {
        parentPort.postMessage({ err: null, wrote: pos })
        await once(parentPort, 'message') // ack
      }
      meta[POS] -= pos
      meta[STATUS] = READY
      if (mode === SYNC) Atomics.notify(meta, STATUS)
      await immediate()
      await poll()
    }
  }

  return poll
}
