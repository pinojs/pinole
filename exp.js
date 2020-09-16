'use strict'
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads')
const maxInt = Math.pow(2, 31) - 1

if (isMainThread) {
  const sharedBuffer = new SharedArrayBuffer(12) 
  const worker = new Worker(__filename, {workerData: { sharedBuffer}})

  const sharedArray = Buffer.from(sharedBuffer)
  const meta = new Int32Array(sharedBuffer)
  const data = sharedArray.slice(4)


  worker.once('online', () => {
    const codec = new TextEncoder()
  
    const { read, written } = codec.encodeInto('⛄️', data)
    console.time('store')
    meta[0] += 1
    // Atomics.add(meta, 0, 1)
    // Atomics.notify(meta, 0, 1)
    console.timeEnd('store')
    
    setTimeout(() => {
      const { read, written } = codec.encodeInto('👍', data)
      // Atomics.add(meta, 0, 1)
      // Atomics.notify(meta, 0, 1)
      meta[0] += 1
      // process.exit()
      // throw Error() 
    }, 1000)
  })
  process.once('SIGINT', () => {
    worker.terminate()
  })
  worker.once('exit', () => {
    console.log('caught exit, now you must flush in main thread, worker has died')
    console.log(data.toString('utf8'))
  })
  worker.once('error', (err) => {
    console.log('worker error', err)
  })


} else {
  const { StringDecoder } = require('string_decoder');
  const decoder = new StringDecoder('utf8');
  const { sharedBuffer } = workerData
  const sharedArray = Buffer.from(sharedBuffer)
  const meta = new Int32Array(sharedBuffer)

  const data = sharedArray.slice(4)
  let count = 0

  function poll (expect) {
    if (meta[0] !== expect) {
      setImmediate(poll, expect)
    } else {
      console.log('write next')
      setTimeout(poll, 100, expect + 1)
    }
  }

  poll(1)

  // need a way to determine bytes written (fs.writeSync returns written bytes)
  // as in ... litrally amount of bytes written
  // not amount of bytes *sent* to *be* written
  // might have to write 1 byte at a time to be sure.. 
  // need this so that syncFlush in main thread on 
  // exit scnearios knows which part of the buffer
  // to flush if the buffer has already been partially written

  // since it's newline delimited, we could split each line by \n
  // then there's last chance of a partial write

  // need to test if fs.writeSync is atomic - e.g. does it bail 

  // do {
  //   count = meta[0]
  //   console.log(data + '', count)
  //   const res = Atomics.wait(meta, 0, count)
  //   console.log(res)
  //   if (res !== 'ok') {
  //     // panic? warn? recover?/resync?
  //     break
  //   }
  // } while (true)


  


}