'use strict'
const SonicBoom = require('sonic-boom')
const sonic = new SonicBoom({fd: 1})
module.exports = (data) => {
  sonic.write(data, 0 , true)
}

module.exports.sync = module.exports