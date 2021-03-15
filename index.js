'use strict'
const SonicBoom = require('sonic-boom')
const ThreadStream = require('thread-stream')
const { createRequire } = require('module')
const caller = require('get-caller-file')
const kPinole = Symbol('pinole')

const entry = require.resolve('./lib/worker.mjs')

const isModuleName = ([ch]) => ch !== '.' && ch !== '/'

class Pinole extends ThreadStream {
  constructor (transporting, parent, opts = {}) {
    if (transporting === false) {
      if (!opts.dest && !opts.fd) opts.fd = 1
      const instance = new SonicBoom(opts)
      instance[kPinole] = true
      return instance
    }
    
    const callerRequire = createRequire(parent)

    let legacy = false
    let transport

    if (isModuleName(opts.transport)) {
      const transportPkg = callerRequire(`${opts.transport}/package.json`)
      const { pino = {}, bin } = transportPkg
      const { transport = 'legacy' } = pino
      const cmd = typeof bin === 'string' ? bin : Object.values(bin).shift()
      legacy = bin && transport === 'legacy'
      if (legacy) transport = callerRequire.resolve(`${opts.transport}/${cmd}`)
    } else {
      transport = callerRequire.resolve(opts.transport)
    }

    super({ filename: entry, workerData: { ...opts, transport, legacy }})
    this.legacy = legacy
    this[kPinole] = true
  }

  unref () {
    const kPublicPort = Object.getOwnPropertySymbols(this.worker)
      .find((sym) => sym.toString() === 'Symbol(kPublicPort)')
    this.worker[kPublicPort].unref()
    this.worker.unref()
  }

  destroy (err) {
    if (this.destroyed) return
    this.worker && this.worker.terminate().then(() => {
      this.destroyed = true
      if (err) this.emit('error', err)
    }).catch((err) => {
      this.emit('error', err)
    })
  }
}

function pinole (opts = { fd: 1 }) {
  const transporting = Object.hasOwnProperty.call(opts, 'transport')
  const parent = transporting ? caller() : null
  return new Pinole(transporting, parent, opts)
} 

pinole.symbols = { kPinole }

module.exports = pinole
