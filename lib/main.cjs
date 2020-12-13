'use strict'
const { Worker, isMainThread } = require('worker_threads')
const SonicBoom = require('sonic-boom')
const { EventEmitter } = require('events')
const { createRequire } = require('module')
const caller = require('get-caller-file')
const {
  SIZE, TIMEOUT, META_BLOCK, STATUS, MODE,
  POS, READY, WRITE, WRITING, ASYNC, SYNC
} = require('./constants.cjs')

const kPinole = Symbol('pinole')
const kSymbolErrData = Symbol('pinole.error.data')
const kSymbolErrCodec = Symbol('pinole.error.codec')

const entry = require.resolve('../index.js')
const legacyTransport = require.resolve('./legacy.js')

const isModuleName = ([ch]) => ch !== '.' && ch !== '/'

class PinoleError extends Error {
  constructor (msg, { data, codec }) {
    super(msg)
    this[kSymbolErrData] = data
    this[kSymbolErrCodec] = codec
  }
}

class Pinole extends EventEmitter {
  constructor (transporting, parent, opts = {}) {
    super()
    if (transporting === false) {
      if (!opts.dest && !opts.fd) opts.fd = 1
      const instance = new SonicBoom(opts)
      instance[kPinole] = true
      return instance
    }

    this[kPinole] = true

    const callerRequire = createRequire(parent)

    this.legacy = false

    if (isModuleName(opts.transport)) {
      const transportPkg = callerRequire(`${opts.transport}/package.json`)
      const { pino = {}, bin } = transportPkg
      const { transport = 'legacy' } = pino
      const cmd = typeof bin === 'string' ? bin : Object.values(bin).shift()
      this.legacy = bin && transport === 'legacy'
      if (this.legacy) this.transport = callerRequire.resolve(`${opts.transport}/${cmd}`)
    }
    
    if (this.legacy === false) this.transport = callerRequire.resolve(opts.transport)
    
    this.transporter = null
    this.max = SIZE
    this.encoding = 'utf-8'
    this.shared = new SharedArrayBuffer(SIZE)
    this.transportOpts = { ...opts, transport: this.legacy ? this.transport : undefined }
    this.spawnWorker = () => {
      try {
        const worker = new Worker(entry, {
          workerData: {
            shared: this.shared,
            opts: this.transportOpts,
            transport: this.legacy ? legacyTransport : this.transport
          },
          stdin: this.legacy
        })
        worker.unref()
        worker.once('exit', (code) => {
          this.worker = null
          this.flushSync()
        })
        worker.once('error', (err) => {
          this.destroy(err)
        })
        return worker
      } catch (err) {
        this.destroy(err)
        return null
      }
    }
    this.worker = this.spawnWorker()
    this.buffer = Buffer.from(this.shared)
    this.meta = new Int32Array(this.shared) // first 8 bytes reserved for STATUS and MODE
    this.data = this.buffer.slice(META_BLOCK)

    this.codec = new TextEncoder(this.encoding)
    this.pos = 0
    this.meta[STATUS] = READY
    this.meta[MODE] = ASYNC
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
    if (this.worker === null) this.worker = this.spawnWorker()

    if (this.meta[STATUS] !== READY) {
      const ready = Atomics.wait(this.meta, STATUS, READY, TIMEOUT)
      if (ready === 'timed-out') {
        this.destroy()
        throw new PinoleError(
          'unable to sync flush data (not able to reach READY status)',
          this
        )
      }
    }
    if (this.meta[POS] === 0) return // nothing to write, no work to do

    this.meta[STATUS] = WRITE
    this.meta[MODE] = SYNC
    
    const write = Atomics.wait(this.meta, STATUS, WRITE, TIMEOUT) // wait for worker thread to write    

    if (write === 'timed-out') {
      
      if (this.meta[POS] === 0) return // nothing to left to write, no work to do
      
      this.destroy()
      throw new PinoleError(
        'unable to sync flush data (pre-write)',
        this
      )
    }
    const writing = Atomics.wait(this.meta, STATUS, WRITING, TIMEOUT) // wait for worker thread to write
    if (writing === 'timed-out') {
      this.destroy()
      throw new PinoleError(
        'unable to sync flush data (during write)',
        this
      )
    }
    this.meta[MODE] = ASYNC
  }

  destroy (err) {
    if (err) this.emit('error', err)
    this.emit('close')
  }
}

function pinole (opts = { fd: 1 }) {
  if (isMainThread === false) return
  const transporting = Object.hasOwnProperty.call(opts, 'transport')
  const parent = transporting ? caller() : null
  return new Pinole(transporting, parent, opts)
}

pinole.symbols = { kPinole }

module.exports = pinole
