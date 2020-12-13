import { PassThrough } from 'stream'

const fauxStdin = new PassThrough()
Object.defineProperty(process, 'stdin', {
  get() {
    return fauxStdin
  },
  configurable: true,
  enumerable: true
})

export default async (opts = {}) => {
  const { transport } = opts
  await import(transport)
  return (data) => {
    fauxStdin.push(data)
  }
}