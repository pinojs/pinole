import { appendFile } from 'fs/promises'

export default (opts = {}) => {
  return async (data, sync) => {
    console.log(opts)
    await appendFile(opts.dest, data)
  }
}
