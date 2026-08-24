import assert from 'node:assert/strict'
import test from 'node:test'
import { configureClientAccess, flushPendingWrites } from './sharedStore.js'
import {
  getBlackoutDates,
  getDateAvailability,
  saveBlackoutDateRange,
} from './blackoutDates.js'
import { installTestBrowserStorage } from './testBrowserStorage.js'

test.beforeEach(() => {
  installTestBrowserStorage()
  configureClientAccess({ canManageBlackouts: true })
})

test('blackout ranges include every date across a calendar-year boundary', async () => {
  saveBlackoutDateRange('2026-12-24', '2027-01-02', 'Winter break')
  await flushPendingWrites()

  const dates = getBlackoutDates()
  assert.equal(dates.length, 10)
  assert.equal(dates[0].date, '2026-12-24')
  assert.equal(dates.at(-1).date, '2027-01-02')
  assert.ok(dates.every(item => item.label === 'Winter break'))
})

test('blackouts override weekend labeling and all unavailable days stay locked', async () => {
  saveBlackoutDateRange('2026-08-29', '2026-08-29', 'Special closure')
  await flushPendingWrites()

  assert.deepEqual(getDateAvailability('2026-08-29'), {
    unavailable: true,
    type: 'blackout',
    label: 'Special closure',
  })
  assert.equal(getDateAvailability('2026-08-30').type, 'weekend')
  assert.equal(getDateAvailability('2026-08-31').unavailable, false)
})

test('blackout ranges reject impossible, reversed, and oversized dates', () => {
  assert.throws(() => saveBlackoutDateRange('2026-02-30', '2026-03-02', 'Invalid'), /valid start date/)
  assert.throws(() => saveBlackoutDateRange('2026-09-02', '2026-09-01', 'Reversed'), /on or after/)
  assert.throws(() => saveBlackoutDateRange('2026-01-01', '2027-01-02', 'Too long'), /too long/)
})
