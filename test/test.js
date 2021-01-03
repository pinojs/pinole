import pinole from '../index.js'
import { readFileSync, unlinkSync } from 'fs'
import { strict as assert } from 'assert'
const transport = './fixtures/basic-transport.js'
const dest = '/Users/davidclements/code/pinole/out'
try { unlinkSync(dest) } catch {}

const stream = pinole({ transport, dest })
console.time('logging time')
console.time('writes')

const n = 10000 * 2 * 2 * 2 * 2

let i = n
while (i-- > 0) {
// setTimeout(() => {
  stream.write(`{"level":30,"time":1609551416940,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n`)
  // }, 1)
  // setTimeout(() => {
  stream.write(`{"level":30,"time":1609551416940,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n`)
// }, 2500)
}
console.log('hi', stream.cache.length)
console.timeEnd('writes')

stream.unref()


// setTimeout(() => {
  
//   stream.write('{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n')
//   setTimeout(() => {
//     console.log('POS', stream.pos)
//     stream.write('{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n')
//     setTimeout(() => {
//       console.log('POS2', stream.pos)
//       let i = n
//       while (i-- > 0) {
//       // setTimeout(() => {
//         stream.write('{"level":30,"time":1531171074631,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n')
//         // }, 1)
//         // setTimeout(() => {
//         stream.write('{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n')
//       // }, 2500)
//       }
//     }, 1000)
//   }, 1000)
  
// }, 1000)

// setTimeout(() => {

// }, 1000000)

// setTimeout(() => {
//   console.log('cool', stream.cache)
// }, 10000)

process.on('exit', () => {
  console.time('sync flush')
  stream.flushSync()
  console.timeEnd('sync flush')
  console.timeEnd('logging time')
  const lines = readFileSync(dest).toString().split('\n')
  assert.equal(lines.length - 1, n * 2)
  console.log('asserting lines')
  lines.forEach((line, ix) => {
    if (line === '') return
    try {
    if (ix % 2) {
      assert.equal(line, `{"level":30,"time":1609551416940,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}`)
    } else {
      assert.equal(line, `{"level":30,"time":1609551416940,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}`)
    }
  } catch (e) {
    console.log('INDEX', ix)
    throw e
  }
  })
})

