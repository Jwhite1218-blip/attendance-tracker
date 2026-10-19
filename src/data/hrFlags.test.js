import assert from 'node:assert/strict'
import test from 'node:test'
import { configureClientAccess, flushPendingWrites } from './sharedStore.js'
import { saveBlackoutDateRange } from './blackoutDates.js'
import {
  attendanceSeverityOf,
  checkAndFlag,
  getAttendanceStageLabel,
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
  for (const code of ['RTO', 'RTO.5', 'M', 'BER', 'OTH']) assert.equal(isQualifyingCode(code), false)
  // 'JUR' was renamed to 'OTH' on 2026-10-11. Days already marked under the
  // old code must keep resolving, and must not start counting as occurrences.
  assert.equal(isQualifyingCode('JUR'), false)
})

test('the fourth occurrence is the first that needs anything', async () => {
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
  // No stage of its own below the fourth: the count is the whole story, and
  // naming one implied a process the app is not part of.
  assert.equal(status.stage, 'documented')
  assert.match(getAttendanceStageLabel(status), /3 documented occurrences/)
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
  assert.equal(status.stage, 'formal_action')
  // The app says something is owed. It never says which step was taken —
  // naming one would make this file read as proof it happened.
  assert.equal(getAttendanceStageLabel(status), 'Formal attendance tracking needed')
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


test('the main page list drops third occurrences and keeps fourth and up', () => {
  const third = { empId: 'a', occurrenceCount: 3 }
  const fourth = { empId: 'b', occurrenceCount: 4 }
  const seventh = { empId: 'c', occurrenceCount: 7 }
  assert.deepEqual(
    mainPageFlagged([third, fourth, seventh]).map(entry => entry.empId),
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

// Liz, 2026-10-19: the HR manager had been treating what this shows as the
// formal documentation. It is a count. These assertions exist so that no
// future wording change quietly turns it back into a disciplinary claim.
test('no stage label names a disciplinary step', () => {
  const labels = [1, 2, 3, 4, 5, 6, 7, 12].map(occurrenceCount => getAttendanceStageLabel({
    occurrenceCount,
    stage: occurrenceCount >= 4 ? 'formal_action' : 'documented',
  }))
  for (const label of labels) {
    for (const forbidden of ['verbal', 'written', 'termination', 'seniority', 'warning', 'discipline']) {
      assert.ok(
        !label.toLowerCase().includes(forbidden),
        `"${label}" names ${forbidden}, which this app must not claim happened`
      )
    }
  }
})

test('stage names written before 2026-10-19 still read correctly', () => {
  assert.equal(getAttendanceStageLabel({ stage: 'verbal_warning', occurrenceCount: 4 }),
    'Formal attendance tracking needed')
  // The old third-occurrence stage now falls through to its count, which is
  // what every status below the fourth occurrence says.
  assert.match(getAttendanceStageLabel({ stage: 'formal_tracking', occurrenceCount: 3 }),
    /3 documented occurrences/)
})

test('a count below the first threshold just says how many', () => {
  assert.match(getAttendanceStageLabel({ stage: 'documented', occurrenceCount: 2 }), /2 documented occurrences/)
  assert.match(getAttendanceStageLabel({ stage: 'documented', occurrenceCount: 1 }), /1 documented occurrence/)
  assert.equal(getAttendanceStageLabel(null), 'No active attendance action')
})
