import test from 'node:test'
import assert from 'node:assert/strict'
import { isFoodDay } from './foodDay.js'

test('Food Day starts and ends at Indianapolis midnight, regardless of device timezone', () => {
  assert.equal(isFoodDay(new Date('2026-09-23T03:59:59Z')), false)
  assert.equal(isFoodDay(new Date('2026-09-23T04:00:00Z')), true)
  assert.equal(isFoodDay(new Date('2026-09-24T03:59:59Z')), true)
  assert.equal(isFoodDay(new Date('2026-09-24T04:00:00Z')), false)
  assert.equal(isFoodDay(new Date('2027-09-23T16:00:00Z')), false)
})
