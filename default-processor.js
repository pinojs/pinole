'use strict'
const SonicBoom = require('sonic-boom')
const sonic = new SonicBoom({fd: 1})

// processors can be async (return promise), use callbacks, or be fire and forget

module.exports = (data) => {
  sonic.write(data, 0 , true)
}

module.exports.sync = module.exports