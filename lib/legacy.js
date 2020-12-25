import { once } from 'events'
import SonicBoom from 'sonic-boom'
import { promisify } from 'util'
const timeout = promisify(setTimeout)
const sonicOut = new SonicBoom({ fd: 1 })
const sonicErr = new SonicBoom({ fd: 2 })

process.stdout.write = (data) => sonicOut.write(data + '')
process.stderr.write = (data) => sonicErr.write(data + '')

export default async (opts = {}) => {
  const { transport, syncWaitMs = 300 } = opts
  await import(transport)
  return async (data, sync) => {
    const pushed = once(process.stdin, 'data')
    process.stdin.push(data)
    await pushed
    if (sync) await timeout(syncWaitMs)
  }
}
