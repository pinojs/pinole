const pinole = require('.')

const stream = pinole('./default-processor')


stream.write('hello :)')
stream.write('something else :D')