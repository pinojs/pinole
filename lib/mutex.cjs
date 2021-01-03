'use strict'

const LOCKED = 1
const UNLOCKED = 0

function createMutex (ui32) {
  return {
    lock() {
      while (true) {
        if (Atomics.compareExchange(ui32, 0, UNLOCKED, LOCKED) === UNLOCKED) {
          break
        }
        Atomics.wait(ui32, 0, LOCKED)
      }
    },

    unlock() {
      if (Atomics.compareExchange(ui32, 0, LOCKED, UNLOCKED) !== LOCKED) {
        throw Error('inconsistent mutex state (unlock on unlocked mutex)')
      }
      Atomics.notify(ui32, 0)
    }
  }
}

module.exports = createMutex