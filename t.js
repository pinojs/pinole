const cherenkov = require('.')

const stream = cherenkov('./default-processor')


stream.write('hello :)')
stream.write('something else :D')