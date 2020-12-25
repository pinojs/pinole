import pinole from '../index.js'
import { readFileSync, unlinkSync } from 'fs'
import { strict as assert } from 'assert'
const transport = './fixtures/basic-transport.js'
const dest = '/Users/davidclements/code/pinole/out'
try { unlinkSync(dest) } catch {}
const stream = pinole({ transport, dest })
console.time('logging time')
console.time('writes')
const n = 100000 / 2

let i = n
while (i-- > 0) {
// setTimeout(() => {
  stream.write('{"level":30,"time":1531171074631,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n')
  // }, 1)
  // setTimeout(() => {
  stream.write('{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n')
// }, 2500)
}
console.timeEnd('writes')

stream.unref()

process.on('exit', () => {
  console.time('sync flush')
  stream.flushSync()
  console.timeEnd('sync flush')
  console.timeEnd('logging time')
  assert.equal(readFileSync(dest).toString().split('\n').length - 1, n * 2)
})
