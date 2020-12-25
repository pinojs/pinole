'use strict'

const SIZE = 16 * 1024 * 1024
const TIMEOUT = 2000
const META_BLOCK = 12
const MAX_WRITE = SIZE - META_BLOCK

const STATUS = 0
const MODE = 1
const POS = 2

const READY = 1
const WRITE = 2
const WRITING = 3

const ASYNC = 1
const SYNC = 2

module.exports = {
  SIZE,
  MAX_WRITE,
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
