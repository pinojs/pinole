'use strict'

function wait (array = [], index, expected, timeout = 2000, done) {
  const max = Date.now() + timeout
  let current = array[index]
  if (current === expected) {
    done('ok')
    return
  }
  let prior = current
  const check = () => {
    if (Date.now() > max) {
      done('timed-out')
    } else {
      setImmediate(() => {
        prior = current
        current = array[index]
        if (current === prior) {
          check()
        } else {
          if (current === expected) done('ok')
          else done('not-equal')
        }
      })
    }
  }
  check()
}

module.exports = { wait }
