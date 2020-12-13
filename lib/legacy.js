import SonicBoom from 'sonic-boom'
const sonicOut = new SonicBoom({fd: 1})
const sonicErr = new SonicBoom({fd: 2})

process.stdout.write = (data) => sonicOut.write(data + '')
process.stderr.write = (data) => sonicErr.write(data + '')

export default async (opts = {}) => {
  const { transport } = opts
  await import(transport)
  return (data) => {
    process.stdin.push(data)
  }
}
