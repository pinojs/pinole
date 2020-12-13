import pinole from '../index.js'

const transport = pinole({ transport: 'pino-colada' })

transport.write('{"level":30,"time":1531171074631,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n')
transport.write('{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n')

setTimeout(() => {
  transport.data[0] = 'h'.charCodeAt(0)
  transport.data[1] = 'i'.charCodeAt(0)
  transport.data[2] = '\n'.charCodeAt(0)
  transport.pos = 3
  transport.meta[2] = 3
}, 500)

process.once('exit', () => {
  transport.flushSync()
})