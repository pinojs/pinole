import { isMainThread } from 'worker_threads'
import main from './lib/main.cjs'

export default main
export const symbols = main.symbols

if (isMainThread === false) {
  try {
    const { worker } = await import('./lib/worker.js')
    const poll = await worker()
    await poll()
  } catch (err) {
    console.error(err)
    process.exit(-1)
  }
}