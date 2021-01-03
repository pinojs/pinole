import { createServer } from 'http'
import pinole from '../index.js'

const transport = './fixtures/basic-transport.js'
const dest = '/Users/davidclements/code/pinole/out'
try { unlinkSync(dest) } catch {}

const stream = pinole({ transport: 'pino-colada', dest })

stream.on('error', (err) => {
  console.log('caught error', err)
})

const n = 100
const server = createServer((req, res) => {
  let i = n
  while (i-- > 0) {
    stream.write('{"level":30,"time":1531171074631,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n')
    stream.write('{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n')
  }
  res.end('')
})

server.listen(3000)