import assert from 'node:assert/strict'
import test from 'node:test'
import { getWeekDates } from './weekDates.js'

test('weekly attendance view starts on Monday and ends on Sunday', () => {
  assert.deepEqual(getWeekDates(0, new Date(2026, 7, 24, 12)), [
    '2026-08-24',
    '2026-08-25',
    '2026-08-26',
    '2026-08-27',
    '2026-08-28',
    '2026-08-29',
    '2026-08-30',
  ])
})

test('Sunday remains in the Monday-first week and offsets move full weeks', () => {
  assert.equal(getWeekDates(0, new Date(2026, 7, 30, 12))[0], '2026-08-24')
  assert.equal(getWeekDates(-1, new Date(2026, 7, 24, 12))[0], '2026-08-17')
  assert.equal(getWeekDates(1, new Date(2026, 7, 24, 12))[0], '2026-08-31')
})
