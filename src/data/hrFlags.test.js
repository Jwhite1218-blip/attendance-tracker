import assert from 'node:assert/strict'
import test from 'node:test'
import { configureClientAccess, flushPendingWrites } from './sharedStore.js'
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

test.beforeEach(() => {
  installTestBrowserStorage()
  configureClientAccess({ canEditAttendance: true })
})

test('Liz qualifying codes exclude approved and protected leave', () => {
  for (const code of ['UNEX', 'LI', 'EO', 'NCNS']) assert.equal(isQualifyingCode(code), true)
  for (const code of ['RTO', 'RTO.5', 'M', 'BER', 'JUR']) assert.equal(isQualifyingCode(code), false)
})

test('third occurrence starts formal tracking and fourth requires a verbal warning', async () => {
  const employeeId = 'threshold-test'
  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [`${SCHOOL_YEAR_START}-08-10`, 'UNEX'],
    [`${SCHOOL_YEAR_START}-09-10`, 'LI'],
    [`${SCHOOL_YEAR_START}-10-10`, 'EO'],
  ))
  await flushPendingWrites()

  let status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.occurrenceCount, 3)
  assert.equal(status.stage, 'formal_tracking')
  assert.equal(isFlagged(employeeId), true)

  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [`${SCHOOL_YEAR_START}-08-10`, 'UNEX'],
    [`${SCHOOL_YEAR_START}-09-10`, 'LI'],
    [`${SCHOOL_YEAR_START}-10-10`, 'EO'],
    [`${SCHOOL_YEAR_START}-11-10`, 'NCNS'],
  ))
  await flushPendingWrites()

  status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.occurrenceCount, 4)
  assert.equal(status.stage, 'verbal_warning')
})

test('two consecutive UNEX workdays reset seniority across a weekend', async () => {
  const employeeId = 'seniority-test'
  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    ['2026-08-28', 'UNEX'],
    ['2026-08-31', 'UNEX'],
  ))
  await flushPendingWrites()

  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.seniorityReset, true)
  assert.equal(status.seniorityResetAt, '2026-08-31')
  assert.equal(isFlagged(employeeId), true)
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
