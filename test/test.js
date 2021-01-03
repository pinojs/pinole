import pinole from '../index.js'
import { readFileSync, unlinkSync } from 'fs'
import { strict as assert } from 'assert'
const transport = './fixtures/basic-transport.js'
const dest = '/Users/davidclements/code/pinole/out'
try { unlinkSync(dest) } catch {}

const stream = pinole({ transport, dest })
stream.unref()
console.time('logging time')
console.time('writes')



//const n = 100000  // succceeds
const n = 1000000 // fails

let i = n
while (i-- > 0) {
  stream.write(`{"level":30,"time":1609551416940,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n`)
  stream.write(`{"level":30,"time":1609551416940,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n`)
}
console.log('cache size', stream.cache.length)
console.timeEnd('writes')




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

