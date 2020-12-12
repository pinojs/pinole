'use strict'
const pinole = require('./index.cjs')

const transport = pinole('./lib/default-processor')
transport.write('hello :)')
transport.write('something else :D')

setTimeout(() => {
  // slip some data to simulate queued data:
  // will flush when ctrl+c is pressed
  transport.data[0] = 'h'.charCodeAt(0)
  transport.data[1] = 'i'.charCodeAt(0)
  transport.data[2] = '!'.charCodeAt(0)
  transport.pos = 3
  transport.meta[2] = 3
}, 500)
