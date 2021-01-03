'use strict'
const createMutex = require('./mutex.cjs')

const ARRIVE = 0
const LEAVE = 1
const FLAG = 2

function createBarrier (uInt32Array, lock, threadCount, init = false) {
  const mutex = createMutex(lock)
  if (init) {
    Atomics.store(uInt32Array, LEAVE, threadCount)
    Atomics.notify(uInt32Array, LEAVE)
  }
  var c = 0
  return () => {
    // process._rawDebug(++c + ':' + (init ? 'main ' : 'worker ') + 'barrier [' + Error().stack.split('\n')[2].trim().replace(/^at /, '') + ']')

    mutex.lock()
    if (uInt32Array[ARRIVE] === 0) {
      if (uInt32Array[LEAVE] !== threadCount) {
        mutex.unlock()
        while (Atomics.load(uInt32Array, LEAVE) !== threadCount) {}
        mutex.lock()
      }
      uInt32Array[FLAG] = 0
    }
    Atomics.add(uInt32Array, ARRIVE, 1)
    const arrived = Atomics.load(uInt32Array, ARRIVE)
    mutex.unlock()
    if (arrived === threadCount) {
      Atomics.store(uInt32Array, ARRIVE, 0)
      Atomics.store(uInt32Array, LEAVE, 1)
      Atomics.store(uInt32Array, FLAG, 1)
      Atomics.notify(uInt32Array, ARRIVE)
      Atomics.notify(uInt32Array, LEAVE)
      Atomics.notify(uInt32Array, FLAG)
    } else {
      while (Atomics.load(uInt32Array, FLAG) === 0) {}
      mutex.lock()
      Atomics.add(uInt32Array, LEAVE, 1)
      mutex.unlock()
    }
    // process._rawDebug(++c + ':' + (init ? 'main ' : 'worker ') + 'barrier [' + Error().stack.split('\n')[2].trim().replace(/^at /, '') + ']')
  }
}

module.exports = createBarrier