import pinole from '../index.js'
import os from 'os'
import { join } from 'path'
import { readFileSync, unlinkSync } from 'fs'
import { strict as assert } from 'assert'
const transport = './fixtures/basic-transport.mjs'
const tmp = os.tmpdir()
const dest = join(tmp, 'out')
try { unlinkSync(dest) } catch {}

const stream = pinole({ transport, dest })
// stream.unref()
console.time('logging time')
console.time('writes')



const n = 10000// succceeds
// const n = 100000 // fails

let i = n
while (i-- > 0) {
  stream.write(`{"level":30,"time":1609551416940,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n`)
  stream.write(`{"level":30,"time":1609551416940,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n`)
}
console.timeEnd('writes')
console.log(dest)



process.on('exit', () => {
  console.log('shit')
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

