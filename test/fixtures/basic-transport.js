import SonicBoom from 'sonic-boom'

export default (opts = { fd: 1 }) => {
  if (!opts.dest && !opts.fd) opts.fd = 1
  opts.sync = true
  const sonic = new SonicBoom(opts)
  return (data, sync) => {
    sonic.write(data)
  }
}
