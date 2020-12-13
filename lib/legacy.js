import SonicBoom from 'sonic-boom'
const sonic = new SonicBoom({fd: 1})

process.stdout.write = (data) => sonic.write(data + '')

export default async (opts = {}) => {
  const { transport } = opts
  await import(transport)
  return async (data, sync) => {
    process.stdin.push(data)
  }
}
