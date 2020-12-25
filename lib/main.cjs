'use strict'
const { Worker, isMainThread } = require('worker_threads')
const SonicBoom = require('sonic-boom')
const { EventEmitter } = require('events')
const { createRequire } = require('module')
const caller = require('get-caller-file')
const {
  SIZE, MAX_WRITE, TIMEOUT, META_BLOCK, STATUS,
  MODE, POS, READY, WRITE, WRITING, ASYNC, SYNC
} = require('./constants.cjs')
const kPinole = Symbol('pinole')
const kSymbolErrData = Symbol('pinole.error.data')
const kSymbolErrCodec = Symbol('pinole.error.codec')
const kDrain = Symbol('pinole.drain')
const kPull = Symbol('pinole.pull')

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

    this.writing = false
    this.destroyed = false
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

    this[kPull] = this[kPull].bind(this)
    this[kDrain] = this[kDrain].bind(this)

    this.worker.on('message', this[kPull])
  }

  unref () {
    const kPublicPort = Object.getOwnPropertySymbols(this.worker)
      .find((sym) => sym.toString() === 'Symbol(kPublicPort)')
    this.worker[kPublicPort].unref()
  }

  [kPull] ({ err }) {
    if (err) {
      this.destroy(err)
      return
    }
    this.worker.postMessage('ack')
    if (this.pos !== this.meta[POS]) {
      this[kDrain]()
    } else {
      this.writing = false
      this.emit('drain')
    }
  }

  [kDrain] () {
    this.meta[POS] = this.pos
    this.meta[STATUS] = WRITE
  }

  write (data = '') {
    if (this.destroyed) throw new Error('Pinole destroyed')

    // TODO: turn this.data into a "circular buffer",
    // use read, and written to determine when to loop 
    // the pos around. In the worker thread implement a way
    // to loop around the reading without re-reading "unlinked"
    // bytes (maybe just zero fill to pos, but that would make 0 bytes problematic)

    const { read, written } = this.codec.encodeInto(data, this.data.subarray(this.pos))
    this.pos += written
    const unbusy = read === data.length
    if (this.writing) return unbusy
    this.writing = true
    this[kDrain]()
    return unbusy
  }

  end () {
    if (this.destroyed) throw new Error('Pinole destroyed')
    this.destroy()
  }

  flush () {
    if (this.destroyed) throw new Error('Pinole destroyed')
    if (this.writing) return
    this[kDrain]()
  }

  flushSync () {
    if (this.destroyed) throw new Error('Pinole destroyed')
    if (this.worker === null) this.worker = this.spawnWorker()
    if (this.meta[POS] === 0) return // nothing to write, no work to do

    this.worker.removeListener('message', this[kPull]) // derefs the messenger port

    this.worker.postMessage('ack')

    Atomics.compareExchange(this.meta, MODE, ASYNC, SYNC)
    Atomics.exchange(this.meta, POS, this.pos)
    Atomics.exchange(this.meta, STATUS, WRITE)

    while (this.meta[MODE] === SYNC) {
      Atomics.wait(this.meta, MODE, ASYNC, TIMEOUT)
    }

    this.worker.on('message', this[kPull])
  }

  destroy (err) {
    if (this.destroyed) return
    this.worker && this.worker.terminate().then(() => {
      this.destroyed = true
      if (err) this.emit('error', err)
      this.emit('close')
    }).catch((err) => {
      this.emit('error', err)
    })
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
