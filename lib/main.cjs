'use strict';
const { Worker, isMainThread, MessageChannel } = require('worker_threads')
const SonicBoom = require('sonic-boom')
const { EventEmitter } = require('events')
const { createRequire } = require('module')
const createBarrier = require('./barrier.cjs')
const flatstr = require('flatstr')
const caller = require('get-caller-file')
const {
  SIZE, TIMEOUT, META_BLOCK, BLOCK, STATUS,
  MODE, POS, MUTEX, READY, WRITE, ASYNC, SYNC
} = require('./constants.cjs');
const kPinole = Symbol('pinole')
const kDrain = Symbol('pinole.drain')
const kPull = Symbol('pinole.pull')

const entry = require.resolve('../index.js')
const legacyTransport = require.resolve('./legacy.js')

const isModuleName = ([ch]) => ch !== '.' && ch !== '/'



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
    this.encoding = 'utf-8'
    this.shared = new SharedArrayBuffer(SIZE)
    this.transportOpts = { ...opts, transport: this.legacy ? this.transport : undefined }
    this.spawnWorker = () => {
      const { port1, port2 } = new MessageChannel()
      this.flushSyncPort = port2
      try {
        const worker = new Worker(entry, {
          workerData: {
            flushSyncPort: port1,
            shared: this.shared,
            opts: this.transportOpts,
            transport: this.legacy ? legacyTransport : this.transport
          },
          transferList: [ port1 ],
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
    this.meta = new Int32Array(this.shared) 
    this.data = this.buffer.slice(META_BLOCK)
    // this.codec = new TextEncoder(this.encoding)
    this.barrier = createBarrier(this.meta.subarray(4, 7), this.meta.subarray(7, 8), 2, true)
    this.pos = 0
    this.cache = ''
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

  [kPull] (err) {
    if (err) {
      this.destroy(err)
      return
    }
    const len = this.cache.length
    if (len > 0 && this.pos + len <= BLOCK) {
      const data = this.cache 
      this.cache = ''
      // const { written } = this.codec.encodeInto(data, this.data.subarray(this.pos))
      const written = this.data.write(data, this.pos, 'utf-8')
      this.pos += written
    }
    if (this.pos > this.meta[POS]) {
      this[kDrain]()
      this.worker.postMessage(null)
    } else {
      this.pos = 0
      const len = this.cache.length
      if (len > 0) {
        const data = len > BLOCK ? this.cache.slice(0, BLOCK) : this.cache
        this.cache = len > BLOCK ? this.cache.slice(BLOCK) : ''
        // const { written } = this.codec.encodeInto(data, this.data.subarray(this.pos))
        const written = this.data.write(data, this.pos, 'utf-8')
        this.pos += written
        this.worker.postMessage(null)
        this[kDrain]()
      } else {
        this.writing = false
        this.worker.postMessage(null)
        this.emit('drain')
      }
    }
  }

  [kDrain] () {
    this.meta[POS] = this.pos
    Atomics.store(this.meta, STATUS, WRITE)
    Atomics.notify(this.meta, STATUS)
  }

  write (data = '') {
    if (this.destroyed) throw new Error('Pinole destroyed')

    if (this.writing) {
      this.cache += data
      // if (this.cache.length > BLOCK) {
      //   this.flushSync()
      // }
      return true
    }

    this.writing = true
    // const { written } = this.codec.encodeInto(data, this.data.subarray(this.pos))
    const written = this.data.write(data, this.pos, 'utf-8')
    this.pos += written
    this[kDrain]()
    return true
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
    this.worker.removeListener('message', this[kPull]) // derefs the messenger port

    Atomics.store(this.meta, MODE, SYNC)
    Atomics.notify(this.meta, MODE)
    Atomics.store(this.meta, POS, this.pos)
    Atomics.notify(this.meta, POS)
    Atomics.store(this.meta, STATUS, WRITE)    
    Atomics.notify(this.meta, STATUS)
    this.worker.postMessage(null) // clear any on going async writes
    this.barrier()
    if (this.pos > 0) { // allow for drain
      this.barrier()
      this.pos = Atomics.load(this.meta, POS)
    }
    if (this.cache.length === 0) {
      this.flushSyncPort.postMessage(false)
      this.barrier()
    }
    
    while (this.cache.length > 0) {
      this.barrier()
      this.flushSyncPort.postMessage(true)
      const data = this.cache.length > BLOCK ? this.cache.slice(0, BLOCK) : this.cache
      this.cache = this.cache.length > BLOCK ? this.cache.slice(BLOCK) : ''
      const written = this.data.write(data, 0, 'utf-8')
      process._rawDebug('WRITE', written)
      if (written < data.length) {
        this.cache = data.subarray(written) + this.cache
      }
      Atomics.store(this.meta, POS, written)
      this.barrier()
    }


    this.flushSyncPort.postMessage(false)
    this.barrier()
    // this doesn't work as a wait in certain cases 
    // (race condition, wait never resolves if it's already the expected value) 
    // so we have to keep loading the value instead
    while (Atomics.load(this.meta, STATUS) !== READY) {} 

    this.pos = 0
    this.writing = false
    this.worker.on('message', this[kPull])
    this.emit('drain')

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
