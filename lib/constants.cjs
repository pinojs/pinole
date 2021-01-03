'use strict'

const META_BLOCK = 40
const BLOCK = (16 * 1024 * 1024) 
const SIZE = BLOCK + META_BLOCK
const TIMEOUT = 2000

const STATUS = 0
const MODE = 1
const POS = 2
const LAST = 3

const READY = 1
const WRITE = 2
const WRITING = 3

const ASYNC = 1
const SYNC = 2

module.exports = {
  SIZE,
  BLOCK,
  TIMEOUT,
  META_BLOCK,
  STATUS,
  MODE,
  POS,
  READY,
  WRITE,
  WRITING,
  ASYNC,
  SYNC
}
