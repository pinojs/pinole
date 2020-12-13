const reservoir = [] // todo: use shared array buffer from main thread so data isn't lost
const eol = /(\r?\n)$/

process.stdout.write = (data) => {
  data = reservoir.join('') + data
  reservoir.length = 0
  if (eol.test(data)) {
    process._rawDebug(data.replace(eol, ''))
    return true
  }
  const lines = data.split(/\r?\n/)
  reservoir.push(lines.pop())
  for (const line of lines) {
    process._rawDebug(line)
  }
  return true
}

export default async (opts = {}) => {
  const { transport } = opts
  await import(transport)
  return async (data, sync) => {
    if (sync && eol.test(data) === false) data += '\n'
    process.stdin.push(data)
  }
}
