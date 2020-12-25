import { parentPort, workerData } from 'worker_threads'
import { once } from 'events'
import { promisify } from 'util'
import {
  META_BLOCK, STATUS, MODE, POS, READY, WRITE, WRITING, ASYNC, SYNC
} from './constants.cjs'

const breathe = promisify(setTimeout)

const { shared, transport, opts } = workerData

export const worker = async () => {
  let createTransporter = await import(transport)
  createTransporter = createTransporter.default || createTransporter

  if (typeof createTransporter !== 'function') throw Error('transporter must be a function')
  const transporter = await createTransporter(opts)
  if (typeof transporter !== 'function') throw Error('transporter must return a function')

  const buffer = Buffer.from(shared)
  const meta = new Int32Array(shared)
  const data = buffer.slice(META_BLOCK)

  async function poll (from = 0) {
    if (meta[STATUS] === READY) {
      await breathe()
      await poll(from)
    }
    if (meta[STATUS] === WRITE) {
      const mode = meta[MODE]
      meta[STATUS] = WRITING
      if (mode === SYNC) Atomics.notify(meta, STATUS)
      const to = meta[POS]
      const chunk = Buffer.alloc(to - from)
      data.copy(chunk, 0, from, to)
      await transporter(chunk, mode === SYNC)
      if (mode === SYNC) {
        // avoid race condition with main thread by
        // slowing down worker on sync flush, 100ms
        // should cover enough ms for execution time
        // in the syncFlush function:
        await breathe()
      }
      if (mode === ASYNC) {
        parentPort.postMessage({ err: null })
        await once(parentPort, 'message') // ack

        // syncFlush has occurred during an async write
        if (meta[MODE] === SYNC) {
          await poll(to)
          meta[STATUS] = READY
        } else {
          meta[STATUS] = READY
        }
      }

      if (mode === SYNC) {
        Atomics.notify(meta, STATUS)
        Atomics.store(meta, MODE, ASYNC)
        Atomics.notify(meta, MODE)
      }
      await breathe()
      await poll(to)
    }
  }

  return poll
}
