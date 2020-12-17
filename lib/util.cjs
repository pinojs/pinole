'use strict'
const { promisify } = require('util')
const immediate = promisify(immediate)

async function wait (array = [], index, expected, timeout = 2000) {
  const max = Date.now() + timeout
  let current = array[index]
  if (current === expected) return 'ok'
  let prior = current
  while (current === prior) {
    if (Date.now() > max) return 'timed-out'
    await immediate() 
    prior = current
    current = array[index]
  }
  return (current === expected) ? 'ok' : 'not-equal'
}

module.exports = { wait }