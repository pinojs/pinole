import { Writable } from 'readable-stream'
import SonicBoom from 'sonic-boom'
const sonicOut = new SonicBoom({ fd: 1 })
const sonicErr = new SonicBoom({ fd: 2 })

process.stdout.write = (data) => sonicOut.write(data + '')
process.stderr.write = (data) => sonicErr.write(data + '')

export default async (opts = {}) => {
  const { transport, legacy, ...options } = opts
  // if (legacy) { }

  const { default: init } = await import(transport)
  const result = init(options)

  if (typeof result === 'function') {

    return new Writable({
      async write(chunk, enc, cb) {
        try {
          await result(chunk)
          cb()
        } catch (err) {
          cb(err)
        }
      }
    })
  }

  if (typeof result.pipe === 'function') return result


}