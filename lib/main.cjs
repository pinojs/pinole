const { Worker, isMainThread } = require('worker_threads')
const SonicBoom = require('sonic-boom')
const { EventEmitter } = require('events')
const { createRequire } = require('module')
const caller = require('get-caller-file')
const {
  SIZE, TIMEOUT, META_BLOCK, STATUS, MODE,
  POS, READY, WRITE, WRITING, ASYNC, SYNC
} = require('./constants.cjs')

const kPinoleWriter = Symbol('pinole.writer')

const entry = require.resolve('../index.js')

class Pinole extends EventEmitter {
  constructor (transporting, parent, opts = {}) {
    super()
    if (transporting === false) {
      const { fd = 1 } = opts
      const instance = new SonicBoom({...opts, fd})
      instance[kPinoleWriter] = true
      return instance
    }
    
    this[kPinoleWriter] = true

    const callerRequire = createRequire(parent)
    const transport = callerRequire.resolve(opts.transport)
    
    this.transport = transport
    this.processor = null
    this.max = SIZE
    this.encoding = 'utf-8'
    this.shared = new SharedArrayBuffer(SIZE)
    const workerOpts = {...opts, transport: null}
    this.worker = new Worker(entry, { workerData: { shared: this.shared, opts: workerOpts, transport, encoding: this.encoding } })
    this.buffer = Buffer.from(this.shared)
    this.meta = new Int32Array(this.shared) // first 8 bytes reserved for STATUS and MODE
    this.data = this.buffer.slice(META_BLOCK)
    
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
    // load the processor in the main thread for a potential
    // syncFlush later on
    import(transport)
      .then(async (createProcessor) => {
        const processor = await (createProcessor.default || createProcessor)(opts)
        this.processor = processor
      })
      .catch((err) => this.destroy(err))
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
    this.worker.once('message', ({ err, wrote }) => {
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
  flush () {}
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
      const { processor } = this
      if (processor === null) {
        // early crash, nothing to log anyway, bail
        return
      }
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

  destroy (err) {
    if (err) this.emit('error', err)
    this.emit('close')
  }
}

function pinole (opts = {fd: 1}) {
  if (isMainThread === false) return
  const transporting = Object.hasOwnProperty.call(opts, 'transport')
  const parent = transporting ? caller() : null
  return new Pinole(transporting, parent, opts)
}

pinole.symbols = { kPinoleWriter }

module.exports = pinole
