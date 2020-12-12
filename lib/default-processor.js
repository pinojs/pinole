import SonicBoom from 'sonic-boom'
const sonic = new SonicBoom({ fd: 1 })

// processors can be async (return promise), use callbacks, or be fire and forget

const write = (data) => {
  sonic.write(data, 0, true)
}

export default write

export const sync = write
