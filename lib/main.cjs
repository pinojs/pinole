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

const kPinoleWriter = Symbol('pinole.writer')
const kSymbolErrData = Symbol('pinole.error.data')
const kSymbolErrCodec = Symbol('pinole.error.codec')

const entry = require.resolve('../index.js')
const legacyTransport = require.resolve('./legacy.js')

const isModuleName = ([ch]) => ch !== '.' && ch !== '/'

class PinoleError extends Error {
  constructor (msg, data, codec) {
    super(msg)
    this[kSymbolErrData] = data
    this[kSymbolErrCodec] = codec
  }
  get data () {
    try { 
      return this[kSymbolErrCodec].encode(this[kSymbolErrData]) 
    } catch { 
      return '' 
    }
  }
}

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
    
    this.legacy = false
    this.legacyTransport = ''

    if (isModuleName(opts.transport)) {
      const transportPkg = callerRequire(`${opts.transport}/package.json`) 
      const { pino = {}, bin } = transportPkg
      const { transport = 'legacy' } = pino
      this.legacy = transport === 'legacy'
      if (this.legacy) {
        const cmd = typeof bin === 'string' ? bin : Object.values(bin).shift()
        this.legacyTransport = callerRequire.resolve(`${opts.transport}/${cmd}`)
      }
    }

    this.transport = transport
    this.transporter = null
    this.max = SIZE
    this.encoding = 'utf-8'
    this.shared = new SharedArrayBuffer(SIZE)
    const workerOpts = {...opts, transport: this.legacy ? this.legacyTransport : undefined }
    this.spawnWorker = () => {
      try { 
        const worker = new Worker(entry, { 
          workerData: { 
            shared: this.shared, 
            opts: workerOpts, 
            transport: this.legacy ? legacyTransport : this.transport,
            encoding: this.encoding 
          },
          stdin: this.legacy
        })
        // worker.unref()
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
    process.once('SIGINT', () => {
      this.flushSync()
      this.worker && this.worker.terminate()
    })
    this.worker.once('exit', (code) => {
      this.worker = null
      this.flushSync()
      this.destroy()
    })
    this.worker.once('error', (err) => {
      this.destroy(err)
    })
    // load the transporter in the main thread for a potential
    // syncFlush later on
    import(transport)
      .then(async (createTransporter) => {
        const transporter = await (createTransporter.default || createTransporter)(opts)
        this.transporter = transporter
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
        this.destroy()
        throw new PinoleError(
          'unable to sync flush data (not able to reach READY status)',
          this.data
        )
      }
    }
    if (this.meta[POS] === 0) return // nothing to write, no work to do
    if (this.worker === null) { // worker died, main thread flush
      const { transporter } = this
      if (transporter === null) {
        // early crash, nothing to log anyway, bail
        return
      }
      if (transporter.sync) transporter.sync(this.data, this.encoding)
      else {
        // note: may not be sync, but this is best effort.
        // maybe emit warning
        transporter(this.data, this.encoding)
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
      this.destroy()
      throw new PinoleError(
        'unable to sync flush data (pre-write)',
        this.data
      )
    }
    const writing = Atomics.wait(this.meta, STATUS, WRITING, TIMEOUT) // wait for worker thread to write
    if (writing === 'timed-out') {
      this.destroy()
      throw new PinoleError(
        'unable to sync flush data (during write)',
        this.data
      )
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
