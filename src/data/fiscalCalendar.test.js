import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatYearLabel,
  getCalendarYearMonths,
  getFiscalYearMonths,
  readCalendarMode,
  writeCalendarMode,
} from './fiscalCalendar.js'
import { installTestBrowserStorage } from './testBrowserStorage.js'

test.beforeEach(installTestBrowserStorage)

test('school-year months run from July through the following June', () => {
  const months = getFiscalYearMonths(2026)
  assert.equal(months.length, 12)
  assert.deepEqual(months[0], { year: 2026, monthIdx: 6 })
  assert.deepEqual(months.at(-1), { year: 2027, monthIdx: 5 })
  assert.equal(formatYearLabel(2026, 'fiscal'), '2026–2027')
})

test('calendar-year months remain January through December', () => {
  const months = getCalendarYearMonths(2026)
  assert.deepEqual(months[0], { year: 2026, monthIdx: 0 })
  assert.deepEqual(months.at(-1), { year: 2026, monthIdx: 11 })
})

test('calendar preference is shared between calendar views', () => {
  assert.equal(readCalendarMode(), 'calendar')
  writeCalendarMode('fiscal')
  assert.equal(readCalendarMode(), 'fiscal')
})
