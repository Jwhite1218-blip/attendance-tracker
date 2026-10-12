import assert from 'node:assert/strict'
import test from 'node:test'
import { configureClientAccess, flushPendingWrites } from './sharedStore.js'
import { saveBlackoutDateRange } from './blackoutDates.js'
import {
  attendanceSeverityOf,
  checkAndFlag,
  getEmployeeAttendanceStatus,
  isFlagged,
  isQualifyingCode,
  mainPageFlagged,
  splitFlaggedByEmploymentStatus,
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

test('two consecutive NCNS workdays reset seniority across a weekend', async () => {
  const employeeId = 'seniority-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 7, 5)
  const monday = addDays(friday, 3)
  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [friday, 'NCNS'],
    [monday, 'NCNS'],
  ))
  await flushPendingWrites()

  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.seniorityReset, true)
  assert.equal(status.seniorityResetAt, monday)
  assert.equal(isFlagged(employeeId), true)
})

test('district blackout holidays are skipped between consecutive NCNS workdays', async () => {
  const employeeId = 'holiday-seniority-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 8, 5)
  const mondayHoliday = addDays(friday, 3)
  const tuesday = addDays(friday, 4)

  saveBlackoutDateRange(mondayHoliday, mondayHoliday, 'District holiday')
  await flushPendingWrites()
  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [friday, 'NCNS'],
    [tuesday, 'NCNS'],
  ))
  await flushPendingWrites()

  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.seniorityReset, true)
  assert.equal(status.seniorityResetAt, tuesday)
})

// Liz, 2026-09-01: a call-in is not a no-show. Back-to-back UNEX days are two
// occurrences and nothing more; only NCNS reaches the seniority stage.
test('consecutive UNEX call-ins do not reset seniority', async () => {
  const employeeId = 'unex-no-seniority-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 9, 5)
  const monday = addDays(friday, 3)

  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [friday, 'UNEX'],
    [monday, 'UNEX'],
  ))
  await flushPendingWrites()

  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.seniorityReset, false)
  assert.equal(status.seniorityResetAt, null)
  assert.equal(status.occurrenceCount, 2)
})

test('only NCNS records can trigger a seniority reset', async () => {
  const employeeId = 'ncns-only-seniority-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 11, 5)
  const monday = addDays(friday, 3)

  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [friday, 'NCNS'],
    [monday, 'CC'],
  ))
  await flushPendingWrites()

  assert.equal(getEmployeeAttendanceStatus(employeeId).seniorityReset, false)
})

test('NCNS records on weekends or blackout holidays do not count', async () => {
  const employeeId = 'closed-day-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 10, 5)
  const saturday = addDays(friday, 1)
  const mondayHoliday = addDays(friday, 3)

  saveBlackoutDateRange(mondayHoliday, mondayHoliday, 'District holiday')
  await flushPendingWrites()
  checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [friday, 'NCNS'],
    [saturday, 'NCNS'],
    [mondayHoliday, 'NCNS'],
  ))
  await flushPendingWrites()

  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.occurrenceCount, 1)
  assert.equal(status.seniorityReset, false)
})

// Statuses saved before the rule changed still carry "seniorityReset: true" from
// a pair of UNEX days. They are recomputed on read, so the wrongly flagged
// employees clear themselves at deploy instead of waiting for the next edit to
// their attendance.
test('a status stored under the old consecutive-UNEX rule clears on read', () => {
  const employeeId = 'stale-unex-status-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 7, 5)
  const monday = addDays(friday, 3)

  localStorage.setItem('hr-attendance-progress-v2', JSON.stringify({
    [`${employeeId}-${SCHOOL_YEAR_START}`]: {
      empId: employeeId,
      schoolYearStart: SCHOOL_YEAR_START,
      occurrenceCount: 2,
      stage: 'documented',
      updatedAt: new Date().toISOString(),
      triggers: [{ date: friday, code: 'UNEX' }, { date: monday, code: 'UNEX' }],
      seniorityReset: true,
      seniorityResetAt: monday,
    },
  }))

  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.seniorityReset, false)
  assert.equal(status.seniorityResetAt, null)
  // The occurrences themselves are untouched — only the seniority verdict moved.
  assert.equal(status.occurrenceCount, 2)
  assert.equal(isFlagged(employeeId), false)
})

test('a stored NCNS pair still reads as a seniority reset', () => {
  const employeeId = 'stored-ncns-status-test'
  const friday = firstWeekday(SCHOOL_YEAR_START, 7, 5)
  const monday = addDays(friday, 3)

  localStorage.setItem('hr-attendance-progress-v2', JSON.stringify({
    [`${employeeId}-${SCHOOL_YEAR_START}`]: {
      empId: employeeId,
      schoolYearStart: SCHOOL_YEAR_START,
      occurrenceCount: 2,
      stage: 'documented',
      updatedAt: new Date().toISOString(),
      triggers: [{ date: friday, code: 'NCNS' }, { date: monday, code: 'NCNS' }],
      seniorityReset: false,
      seniorityResetAt: null,
    },
  }))

  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.seniorityReset, true)
  assert.equal(status.seniorityResetAt, monday)
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

test('inactive employees leave the follow-up watch list but keep their flag', () => {
  const activeFlag = { empId: '1', employee: { first_name: 'Amy', active: true } }
  const inactiveFlag = { empId: '2', employee: { first_name: 'Bo', active: false } }
  // Roster records predating the active flag have no `active` field at all.
  const legacyFlag = { empId: '3', employee: { first_name: 'Cy' } }

  const { active, inactive } = splitFlaggedByEmploymentStatus([activeFlag, inactiveFlag, legacyFlag])

  assert.deepEqual(active.map(f => f.empId), ['1', '3'])
  assert.deepEqual(inactive.map(f => f.empId), ['2'])
  // The flag itself is untouched, so reactivating restores it to the main list.
  assert.equal(inactive[0].employee.first_name, 'Bo')
})

test('splitting flagged employees tolerates an empty or missing list', () => {
  assert.deepEqual(splitFlaggedByEmploymentStatus([]), { active: [], inactive: [] })
  assert.deepEqual(splitFlaggedByEmploymentStatus(undefined), { active: [], inactive: [] })
})

// Liz, 2026-10-10: yellow at the third occurrence, red at the fourth, and only
// the fourth reaches the district main page.
test('severity turns yellow at the third occurrence and red at the fourth', () => {
  assert.equal(attendanceSeverityOf(null), 'none')
  assert.equal(attendanceSeverityOf({ occurrenceCount: 0 }), 'none')
  assert.equal(attendanceSeverityOf({ occurrenceCount: 2 }), 'none')
  assert.equal(attendanceSeverityOf({ occurrenceCount: 3 }), 'tracking')
  assert.equal(attendanceSeverityOf({ occurrenceCount: 4 }), 'action')
  assert.equal(attendanceSeverityOf({ occurrenceCount: 12 }), 'action')
})

test('a seniority reset is red immediately, whatever the occurrence count', () => {
  assert.equal(attendanceSeverityOf({ occurrenceCount: 2, seniorityReset: true }), 'action')
  assert.equal(attendanceSeverityOf({ occurrenceCount: 3, seniorityReset: true }), 'action')
})

test('the main page list drops third occurrences and keeps fourth and up', () => {
  const third = { empId: 'a', occurrenceCount: 3 }
  const fourth = { empId: 'b', occurrenceCount: 4 }
  const reset = { empId: 'c', occurrenceCount: 2, seniorityReset: true }
  assert.deepEqual(
    mainPageFlagged([third, fourth, reset]).map(entry => entry.empId),
    ['b', 'c']
  )
  assert.deepEqual(mainPageFlagged([third]), [])
  assert.deepEqual(mainPageFlagged(null), [])
})

// The watch list a building manager sees is deliberately the longer one: the
// third occurrence is the point where someone can still intervene.
test('the building watch list keeps third occurrences that the main page hides', async () => {
  const employeeId = 'severity-building-list'
  const start = `${SCHOOL_YEAR_START}-09-0`
  await checkAndFlag(employeeId, SCHOOL_YEAR_START, records(
    [`${start}1`, 'UNEX'], [`${start}2`, 'UNEX'], [`${start}3`, 'UNEX'],
  ))
  flushPendingWrites()
  const status = getEmployeeAttendanceStatus(employeeId)
  assert.equal(status.occurrenceCount, 3)
  assert.equal(attendanceSeverityOf(status), 'tracking')
  assert.equal(isFlagged(employeeId), true, 'still on the building watch list')
  assert.deepEqual(mainPageFlagged([status]), [], 'but not on the main page')
})
