import { parentPort, workerData } from 'worker_threads'
import { once } from 'events'
import { promisify } from 'util'
import { 
  META_BLOCK, BLOCK, STATUS, MODE, POS, READY, WRITE, WRITING, ASYNC, SYNC
} from './constants.cjs'

import createBarrier from './barrier.cjs'

const breathe = promisify(setTimeout)

const { shared, transport, opts, flushSyncPort } = workerData


const receiveFlushSync = async () => {
  const [ data ] = await once(flushSyncPort, 'message')
  return data
}


export const worker = async () => {
  const pStack = new Set()
  let createTransporter = await import(transport)
  createTransporter = createTransporter.default || createTransporter

  if (typeof createTransporter !== 'function') throw Error('transporter must be a function')
  const transporter = await createTransporter(opts)
  if (typeof transporter !== 'function') throw Error('transporter must return a function')
  const pSelfDealloc = async (promise) => {
    try {
      await promise
    } catch (err) {
      parentPort.postMessage(err)
    } finally {
      pStack.delete(promise)
    }
  }
  const write = async (chunk, sync) => {
    const promise = pSelfDealloc(transporter(chunk, sync))
    pStack.add(promise)
  }
  const buffer = Buffer.from(shared)
  const meta = new Int32Array(shared)
  const barrier = createBarrier(meta.subarray(4, 7), meta.subarray(8, 9), 2)
  const data = buffer.slice(META_BLOCK)


  async function poll (from = 0) {
    await breathe()
    if (meta[STATUS] === READY) {
      await poll(from)
    }
    if (meta[STATUS] === WRITE) {
      const mode = meta[MODE]  

      meta[STATUS] = WRITING

      if (mode === SYNC) { //rename to SYNC_FLUSH
      
        const drainers = Array.from(pStack.values())
        try { 
          await Promise.all(drainers)
        } catch (err) {
          process._rawDebug('WARNING: Error during draining', err)
        }
        
        barrier()
        
        // DRAIN: TODO: CHECK FOR ALL CIRCUMSTANCES WITH ASYNC WRITES ETC
        const to = Atomics.load(meta, POS)
        if (to > from) {
          const chunk = Buffer.alloc(to - from)
          data.copy(chunk, 0, from, to)

          await transporter(data.toString().slice(from, to), mode === SYNC)
          Atomics.store(meta, POS, 0)
          Atomics.notify(meta, POS)
        }

        barrier()

        while (await receiveFlushSync()) {
          barrier()
          const pos = Atomics.load(meta, POS)
          const chunk = Buffer.alloc(pos)
          data.copy(chunk, 0, 0, pos) 
          await transporter(data.toString().slice(0, pos), mode === SYNC)
          barrier()
        }

        await poll()
      }


      // if (mode === ASYNC_FLUSH) {
        
      //   barrier()
        
      //   // DRAIN: TODO: CHECK FOR ALL CIRCUMSTANCES WITH ASYNC WRITES ETC
      //   const to = Atomics.load(meta, POS)
      //   if (to > from) {
      //     const chunk = Buffer.alloc(to - from)
      //     data.copy(chunk, 0, from, to)

      //     write(data.toString().slice(from, to), mode === SYNC)
      //     Atomics.store(meta, POS, 0)
      //     Atomics.notify(meta, POS)
      //   }

      //   barrier()

      //   while (await receiveFlushSync()) {
      //     barrier()
      //     const pos = Atomics.load(meta, POS)
      //     const chunk = Buffer.alloc(pos)
      //     data.copy(chunk, 0, 0, pos) 
      //     write(data.toString().slice(0, pos), mode === SYNC)
      //     barrier()
      //   }

      //   await poll()
      // }


      // rename to SCAVENGE ?
      // purpose is to write any bytes found and allow flush to clean up later and what not
      if (mode === ASYNC) {
        let to = meta[POS]
        if (to < from) from = 0
        const chunk = Buffer.alloc(to - from)
        data.copy(chunk, 0, from, to)

        await write(chunk, mode === SYNC)
        parentPort.postMessage(null)
        // TODDO await Promise.race([<SYNC MODE>, once(parentPort, 'message'))
        await once(parentPort, 'message') // ack
        // syncFlush has occurred during an async write
        if (meta[MODE] === SYNC) {
          await poll(to)
          meta[STATUS] = READY
        } else if (meta[STATUS] === WRITE) { // drain
          await poll(to)
        } else {
          meta[STATUS] = READY
          await poll(to)  
        }
      }

    }
  }

  return poll
}

