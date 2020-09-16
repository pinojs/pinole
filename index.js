'use strict'
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads')
if (isMainThread) {
  const { EventEmitter } = require('events')
  // const SIZE = 16 * 1024 * 1024
  const SIZE = 32

  const STATUS = 0
  const MODE = 1

  const READY = 0
  const WRITE = 1
  const WRITING = 2

  const ASYNC = 0
  const SYNC = 1


  class Pinole extends EventEmitter {
    constructor (file, encoding = 'utf-8') {
      super()
      this.file = require.resolve(file)
      this.max = SIZE
      this.shared = new SharedArrayBuffer(SIZE)
      this.worker = new Worker(__filename, {workerData: { shared: this.shared, file }})
      this.buffer = Buffer.from(this.shared)
      this.meta = this.buffer.slice(0, 4)
      this.data = this.buffer.slice(4)
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
    write (d) {
      const size = Buffer.byteLength(d)
      if (this.meta[STATUS] !== READY) {
        setImmediate(() => this.write(d))
        return
      }
      const { read, written } = this.codec.encodeInto(d, this.data.slice(this.pos))
      this.pos += written
      this.meta[STATUS] = WRITE
    }
    end () {}
    flush() {}
    flushSync () {
      
      if (this.worker === null) { // worker died, main thread flush
        const processor = require(this.file)
        if (processor.sync) processor.sync(this.data)
        else {
          // note: may not be sync, but this is best effort.
          processor(this.data)
        }
      }

      this.meta[STATUS] = WRITE
      this.meta[MODE] = SYNC
      
      // if the Worker is still alive, we can use the worker
      // to flush and use an atomic to block so that main 
      // thread is sync flush, that would be better

      this.data.fill(0)
      this.meta[STATUS] = READY
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
  const { shared, file } = workerData
  const processor = require(file)
  const { promisify } = require('util')
  const immediate = promisify(setImmediate)
  const STATUS = 0
  const MODE = 1

  const READY = 0
  const WRITE = 1
  const WRITING = 2

  const ASYNC = 0
  const SYNC = 1

  if (typeof processor !== 'function') throw Error('processor must be a function')
  
  const buffer = Buffer.from(shared)
  const meta = buffer.slice(0, 4)
  const data = buffer.slice(4)

  async function poll () {
    if (meta[STATUS] === READY) {
      await immediate()
      await poll()
    } 
    if (meta[STATUS] === WRITE) {
      meta[STATUS] = WRITING
      await processor(data) // todo either copy or decode to string
      data.fill(0)
      meta[STATUS] = READY
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
