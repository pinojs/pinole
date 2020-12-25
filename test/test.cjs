'use strict'
const pinole = require('../index.cjs')

const transport = pinole({ transport: './fixtures/basic-transport.js' })

transport.write('{"level":30,"time":1531171074631,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n')
transport.write('{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n')

transport.write('{"level":30,"time":1531171074631,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n')
transport.write('{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n')

transport.write('{"level":30,"time":1531171074631,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n')
transport.write('{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n')

transport.unref()

process.once('exit', () => {
  transport.flushSync()
})

// process.exit(1)
