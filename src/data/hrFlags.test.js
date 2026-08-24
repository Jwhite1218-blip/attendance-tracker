import assert from 'node:assert/strict'
import test from 'node:test'
import { configureClientAccess, flushPendingWrites } from './sharedStore.js'
import { saveBlackoutDateRange } from './blackoutDates.js'
import {
  checkAndFlag,
  getEmployeeAttendanceStatus,
  isFlagged,
  isQualifyingCode,
} from './hrFlags.js'
import { installTestBrowserStorage } from './testBrowserStorage.js'

const SCHOOL_YEAR_START = new Date().getMonth() >= 6
  ? new Date().getFullYear()
  : new Date().getFullYear() - 1

function records(...entries) {
  return Object.fromEntries(entries.map(([date, code]) => [date, { date, code }]))
}

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return date.toISOString().slice(0, 10)
}

function firstWeekday(year, monthIndex, weekday) {
  const date = new Date(year, monthIndex, 1, 12)
  while (date.getDay() !== weekday) date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

test.beforeEach(() => {
  installTestBrowserStorage()
  configureClientAccess({ canEditAttendance: true, canManageBlackouts: true })
})

test('Liz qualifying codes exclude approved and protected leave', () => {
  for (const code of ['UNEX', 'LI', 'EO', 'NCNS']) assert.equal(isQualifyingCode(code), true)
  for (const code of ['RTO', 'RTO.5', 'M', 'BER', 'JUR']) assert.equal(isQualifyingCode(code), false)
})

test('third occurrence starts formal tracking and fourth requires a verbal warning', async () => {
  const employeeId = 'threshold-test'
  const first = firstWeekday(SCHOOL_YEAR_START, 7, 1)
  const second = firstWeekday(SCHOOL_YEAR_START, 8, 1)
  const third = firstWeekday(SCHOOL_YEAR_START, 9, 1)
  const fourth = firstWeekday(SCHOOL_YEAR_START, 10, 1)
  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [first, 'UNEX'],
    [second, 'LI'],
    [third, 'EO'],
  ))
  await flushPendingWrites()

  let status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.occurrenceCount, 3)
  assert.equal(status.stage, 'formal_tracking')
  assert.equal(isFlagged(employeeId), true)

  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [first, 'UNEX'],
    [second, 'LI'],
    [third, 'EO'],
    [fourth, 'NCNS'],
  ))
  await flushPendingWrites()

  status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.occurrenceCount, 4)
  assert.equal(status.stage, 'verbal_warning')
})

test('two consecutive UNEX workdays reset seniority across a weekend', async () => {
  const employeeId = 'seniority-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 7, 5)
  const monday = addDays(friday, 3)
  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [friday, 'UNEX'],
    [monday, 'UNEX'],
  ))
  await flushPendingWrites()

  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.seniorityReset, true)
  assert.equal(status.seniorityResetAt, monday)
  assert.equal(isFlagged(employeeId), true)
})

test('district blackout holidays are skipped between consecutive UNEX workdays', async () => {
  const employeeId = 'holiday-seniority-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 8, 5)
  const mondayHoliday = addDays(friday, 3)
  const tuesday = addDays(friday, 4)

  saveBlackoutDateRange(mondayHoliday, mondayHoliday, 'District holiday')
  await flushPendingWrites()
  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [friday, 'UNEX'],
    [tuesday, 'UNEX'],
  ))
  await flushPendingWrites()

  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.seniorityReset, true)
  assert.equal(status.seniorityResetAt, tuesday)
})

test('only UNEX records can trigger a seniority reset', async () => {
  const employeeId = 'unex-only-seniority-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 9, 5)
  const monday = addDays(friday, 3)

  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [friday, 'UNEX'],
    [monday, 'CC'],
  ))
  await flushPendingWrites()

  assert.equal(getEmployeeAttendanceStatus(employeeId).seniorityReset, false)
})

test('UNEX records on weekends or blackout holidays do not count', async () => {
  const employeeId = 'closed-day-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 10, 5)
  const saturday = addDays(friday, 1)
  const mondayHoliday = addDays(friday, 3)

  saveBlackoutDateRange(mondayHoliday, mondayHoliday, 'District holiday')
  await flushPendingWrites()
  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [friday, 'UNEX'],
    [saturday, 'UNEX'],
    [mondayHoliday, 'UNEX'],
  ))
  await flushPendingWrites()

  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.occurrenceCount, 1)
  assert.equal(status.seniorityReset, false)
})

test('prior school-year stages do not carry into the active July-June year', async () => {
  const employeeId = 'year-boundary-test'
  checkAndFlag(employeeId, SCHOOL_YEAR_START - 1, records(
    [`${SCHOOL_YEAR_START}-03-03`, 'UNEX'],
    [`${SCHOOL_YEAR_START}-04-03`, 'LI'],
    [`${SCHOOL_YEAR_START}-05-03`, 'EO'],
    [`${SCHOOL_YEAR_START}-06-03`, 'NCNS'],
  ))
  await flushPendingWrites()

  assert.equal(getEmployeeAttendanceStatus(employeeId), null)
  assert.equal(isFlagged(employeeId), false)
})
