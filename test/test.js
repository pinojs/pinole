import pinole from '../index.js'
const transport = pinole({ 
  transport: './fixtures/basic-transport.js', 
  dest: '/Users/davidclements/code/pinole/out'
})
console.time('logging time')
console.time('main thread time')
let i = 4000
while (i-- > 0) {
// setTimeout(() => {
  transport.write('{"level":30,"time":1531171074631,"msg":"hello world","pid":657,"hostname":"Davids-MBP-3.fritz.box"}\n')
// }, 499)
// setTimeout(() => {
  transport.write('{"level":30,"time":1531171082399,"msg":"hello child!","pid":657,"hostname":"Davids-MBP-3.fritz.box","a":"property"}\n')
// }, 500)
}
console.timeEnd('main thread time')



process.on('exit', () => {
  transport.flushSync()
  console.timeEnd('logging time')
  
})
