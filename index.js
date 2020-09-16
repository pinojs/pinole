'use strict'
const { Worker, isMainThread, workerData } = require('worker_threads')
  const SIZE = 16 * 1024 * 1024
  const TIMEOUT = 2000
  const META_BLOCK = 12

  const STATUS = 0
  const MODE = 1
  const POS = 2

  const READY = 1
  const WRITE = 2
  const WRITING = 3

  const ASYNC = 1
  const SYNC = 2

if (isMainThread) {
  const { EventEmitter } = require('events')
  class Pinole extends EventEmitter {
    constructor (file, encoding = 'utf-8') {
      super()
      this.file = require.resolve(file)
      this.max = SIZE
      this.shared = new SharedArrayBuffer(SIZE)
      this.worker = new Worker(__filename, {workerData: { shared: this.shared, file, encoding }})
      this.buffer = Buffer.from(this.shared)
      this.meta = new Int32Array(this.shared) // first 8 bytes reserved for STATUS and MODE
      this.data = this.buffer.slice(META_BLOCK)
      this.encoding = encoding
      this.codec = new TextEncoder(this.encoding)
      this.pos = 0
      this.meta[STATUS] = READY
      this.meta[MODE] = ASYNC
      process.once('SIGINT', () => { 
        this.flushSync()
        this.worker.terminate() 
      })
      this.worker.once('exit', (code) => {
        this.worker = null
        this.flushSync()
        this.destroy()
      })
      this.worker.once('error', (err) => { 
        this.destroy(err)
      })
      this._writing = false
    }
    write (d, cb) {
      const size = Buffer.byteLength(d)
      if (this.meta[STATUS] !== READY) {
        setImmediate(() => this.write(d, cb))
        return
      }
      const { written } = this.codec.encodeInto(d, this.data.slice(this.pos))
      this.pos += written
      this.meta[POS] = this.pos
      this.meta[STATUS] = WRITE
      this.worker.once('message', ({err, wrote}) => {
        this.pos -= wrote
        this.worker.postMessage('ack')
        if (typeof cb === 'function') {
          cb(err, wrote)
        } else if (err) {
          this.emit('error', err)
        }
      })
    }
    end () {}
    flush() {}
    flushSync () {
      if (this.meta[STATUS] !== READY) {
        const ready = Atomics.wait(this.meta, STATUS, READY, TIMEOUT)
        if (ready === 'timed-out') {
          const err = Error('unable to sync flush data (not able to reach READY status)')
          err.data = this.data
          throw err
        }
      }
      if (this.meta[POS] === 0) return // nothing to write, no work to do
      if (this.worker === null) { // worker died, main thread flush
        const processor = require(this.file)
        if (processor.sync) processor.sync(this.data, this.encoding)
        else {
          // note: may not be sync, but this is best effort.
          // maybe emit warning
          processor(this.data, this.encoding)
          // is it possible to spawn new worker in last tick,
          // and use atomics.wait to block until worker 
          // is done? then a sync method would not be
          // necessary
        }
        return
      }


      this.meta[STATUS] = WRITE
      this.meta[MODE] = SYNC
      const write = Atomics.wait(this.meta, STATUS, WRITE, TIMEOUT) // wait for worker thread to write
      if (write === 'timed-out') {
        const err = Error('unable to sync flush data (pre-write)')
        err.data = this.data
        throw err
      }
      const writing = Atomics.wait(this.meta, STATUS, WRITING, TIMEOUT) // wait for worker thread to write
      if (writing === 'timed-out') {
        const err = Error('unable to sync flush data (during write)')
        err.data = this.data
        throw err
      }

      this.meta[MODE] = ASYNC
    }
    destroy(err) {
      if (err) this.emit('error', err)
      this.emit('close')
    }
  }

  function pinole (file) {
    return new Pinole(file)
  }

  module.exports = pinole

} else {
  const { once } = require('events')
  const { parentPort } = require('worker_threads')
  const { shared, file, encoding } = workerData
  const processor = require(file)
  const { promisify } = require('util')
  const immediate = promisify(setImmediate)

  if (typeof processor !== 'function') throw Error('processor must be a function')
  
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
        parentPort.postMessage({err: null, wrote: pos})
        await once(parentPort, 'message') // ack
      }
      meta[POS] -= pos
      meta[STATUS] = READY
      if (mode === SYNC) Atomics.notify(meta, STATUS)
      await immediate()
      await poll()
    }
  }

  poll().catch((err) => {
    // communicate error over IPC?
    console.log(err)
    process.exit(-1)
  })
}
