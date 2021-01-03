import SonicBoom from 'sonic-boom'
import { promisify } from 'util'
import { appendFile } from 'fs/promises'
const timeout = promisify(setTimeout)

export default (opts = {}) => {
  return async (data, sync) => {

    await appendFile(opts.dest, data)
  }
}
