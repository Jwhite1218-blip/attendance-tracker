import assert from 'node:assert/strict'
import test from 'node:test'
import { configureClientAccess, flushPendingWrites } from './sharedStore.js'
import {
  addTrainingRecord,
  buildTrainingEmployeeSheet,
  buildTrainingLogSheet,
  buildTrainingReportHeader,
  buildTrainingSummarySheet,
  inferAttendeeScope,
  trainingReportFilename,
  updateTrainingRecord,
  createTrainingRecord,
  formatTrainingHours,
  getAllTrainingRecords,
  isTrainingInSchoolYear,
  removeTrainingRecord,
  requiredHoursFor,
  trainingHoursFor,
  trainingSchoolYearStart,
  trainingSummaryByLocation,
  trainingSummaryForEmployees,
} from './trainingRecords.js'
import { installTestBrowserStorage } from './testBrowserStorage.js'

test.beforeEach(() => {
  installTestBrowserStorage()
  configureClientAccess({ role: 'admin', canManageRoster: true, canManageBlackouts: true })
})

const VALID = {
  title: 'Allergen awareness',
  date: '2026-09-15',
  hours: 0.5,
  type: 'in-service',
  areas: ['nutrition'],
  trainer: 'Liz',
  employeeIds: ['1001'],
}

function training(overrides = {}) {
  return createTrainingRecord({ ...VALID, ...overrides })
}

test('a complete training record is accepted and normalised', () => {
  const record = training({ trainer: '  Liz  ', areas: ['nutrition', 'nutrition', 'operations'] })
  assert.equal(record.title, 'Allergen awareness')
  assert.equal(record.trainer, 'Liz')
  assert.deepEqual(record.areas, ['nutrition', 'operations'], 'duplicates collapse')
  assert.ok(record.id.startsWith('trn-2026-09-15-'))
})

test('every required field is enforced', () => {
  const cases = [
    [{ title: '   ' }, /title is required/],
    [{ date: '15/09/2026' }, /date is required/],
    [{ hours: 0 }, /how many hours/],
    [{ hours: -1 }, /how many hours/],
    [{ type: 'nope' }, /type of training/],
    [{ areas: [] }, /at least one training area/],
    [{ areas: ['astrology'] }, /at least one training area/],
    [{ employeeIds: [] }, /who attended/],
  ]
  for (const [overrides, pattern] of cases) {
    assert.throws(() => training(overrides), pattern, JSON.stringify(overrides))
  }
})

// A stray 0.37 would quietly skew a compliance total that someone later
// reports to the state.
test('hours must land on a quarter and cannot exceed a working day', () => {
  assert.throws(() => training({ hours: 0.37 }), /15-minute increments/)
  assert.throws(() => training({ hours: 13 }), /cannot exceed 12 hours/)
  for (const hours of [0.25, 0.5, 1, 2.75, 12]) {
    assert.equal(training({ hours }).hours, hours)
  }
})

test('a saved record reads back, and can be removed', () => {
  const saved = addTrainingRecord(VALID, { createdBy: 'Liz' })
  flushPendingWrites()

  const all = getAllTrainingRecords()
  assert.equal(all.length, 1)
  assert.equal(all[0].createdBy, 'Liz')

  assert.equal(removeTrainingRecord(saved.id), true)
  flushPendingWrites()
  assert.deepEqual(getAllTrainingRecords(), [])
  assert.equal(removeTrainingRecord('does-not-exist'), false)
})

test('the school year runs July to June', () => {
  assert.equal(trainingSchoolYearStart('2026-07-01'), 2026)
  assert.equal(trainingSchoolYearStart('2026-06-30'), 2025)
  assert.equal(trainingSchoolYearStart('2027-01-15'), 2026)

  assert.equal(isTrainingInSchoolYear({ date: '2026-07-01' }, 2026), true)
  assert.equal(isTrainingInSchoolYear({ date: '2027-06-30' }, 2026), true)
  assert.equal(isTrainingInSchoolYear({ date: '2026-06-30' }, 2026), false)
  assert.equal(isTrainingInSchoolYear({ date: '2027-07-01' }, 2026), false)
  assert.equal(isTrainingInSchoolYear({ date: 'whenever' }, 2026), false)
  assert.equal(isTrainingInSchoolYear({ date: '2020-01-01' }, null), true, 'null counts every year')
})

test('hours add up per employee and reset with the school year', () => {
  const records = [
    training({ hours: 1, employeeIds: ['1001', '1002'] }),
    training({ hours: 0.5, date: '2026-10-02', employeeIds: ['1001'] }),
    training({ hours: 6, date: '2026-05-04', employeeIds: ['1001'] }),
  ]
  assert.equal(trainingHoursFor(records, '1001', 2026), 1.5)
  assert.equal(trainingHoursFor(records, '1002', 2026), 1)
  assert.equal(trainingHoursFor(records, '1003', 2026), 0)
  assert.equal(trainingHoursFor(records, '1001', 2025), 6, 'last year stays in last year')
  assert.equal(trainingHoursFor(records, '1001'), 7.5, 'all years when unscoped')
})

// Three tiers, per Liz 2026-10-11: 12 for the Director, 10 for Managers and
// Worker Leads, 6 for Cooks and Food Service Workers.
test('every position on the roster has a stated requirement', () => {
  assert.equal(requiredHoursFor({ position: 'Food Service Director' }), 12)
  assert.equal(requiredHoursFor({ position: 'Food Service Manager' }), 10)
  assert.equal(requiredHoursFor({ position: 'Food Service Worker Lead' }), 10)
  assert.equal(requiredHoursFor({ position: 'Cook' }), 6)
  assert.equal(requiredHoursFor({ position: 'Food Service Worker' }), 6)
  assert.equal(requiredHoursFor({ position: '  Food Service Worker Lead  ' }), 10, 'whitespace is tolerated')
})

// Admin team titles, given 2026-10-11. None is in the roster yet, so these
// only bite when those people are added — and they match on the exact string.
test('the admin team titles carry their own hours', () => {
  assert.equal(requiredHoursFor({ position: 'RDM' }), 12)
  assert.equal(requiredHoursFor({ position: 'RN' }), 10)
  assert.equal(requiredHoursFor({ position: 'Chef' }), 10)
  for (const title of ['OM', 'FM', 'MM', 'HRM']) {
    assert.equal(requiredHoursFor({ position: title }), 6, title)
  }
  assert.equal(requiredHoursFor({ position: 'Office Manager' }), null, 'spelled out is a different string')
})

// A job title nobody has set hours for must never be reported as compliant.
test('an unknown position reports as unset rather than defaulting to a tier', () => {
  assert.equal(requiredHoursFor({ position: 'Executive Chef' }), null)
  assert.equal(requiredHoursFor({}), null)

  const [row] = trainingSummaryForEmployees([], [{ id: '1', position: 'Executive Chef' }], 2026)
  assert.equal(row.status, 'unset')
  assert.equal(row.remaining, null)
})

test('a summary row says what is left to do', () => {
  const records = [training({ hours: 2, employeeIds: ['1001'] })]
  const employees = [
    { id: '1001', kronos_id: '1001', position: 'Cook', location: 'CrestonMS', last_name: 'Alpha' },
    { id: '1002', kronos_id: '1002', position: 'Food Service Worker', location: 'CrestonMS', last_name: 'Beta' },
  ]
  const [cook, worker] = trainingSummaryForEmployees(records, employees, 2026)
  assert.deepEqual(
    { earned: cook.earned, required: cook.required, remaining: cook.remaining, status: cook.status },
    { earned: 2, required: 6, remaining: 4, status: 'short' }
  )
  assert.equal(worker.earned, 0)
  assert.equal(worker.remaining, 6)
})

test('meeting the requirement exactly counts as met, and overshooting never goes negative', () => {
  const employees = [{ id: '1001', kronos_id: '1001', position: 'Cook', location: 'CrestonMS' }]
  const exactly = trainingSummaryForEmployees([training({ hours: 6, employeeIds: ['1001'] })], employees, 2026)
  assert.equal(exactly[0].status, 'met')
  assert.equal(exactly[0].remaining, 0)

  const over = trainingSummaryForEmployees(
    [training({ hours: 6, employeeIds: ['1001'] }), training({ hours: 2, date: '2026-10-01', employeeIds: ['1001'] })],
    employees,
    2026
  )
  assert.equal(over[0].status, 'met')
  assert.equal(over[0].remaining, 0)
})

test('the by-school report groups and counts without losing anybody', () => {
  const employees = [
    { id: '1', kronos_id: '1', position: 'Cook', location: 'CrestonMS', last_name: 'Zeta' },
    { id: '2', kronos_id: '2', position: 'Cook', location: 'CrestonMS', last_name: 'Alpha' },
    { id: '3', kronos_id: '3', position: 'Executive Chef', location: 'StonyBrkMS', last_name: 'Unknown' },
    { id: '4', kronos_id: '4', position: 'Cook', location: '', last_name: 'Nowhere' },
  ]
  const records = [training({ hours: 6, employeeIds: ['1'] })]
  const groups = trainingSummaryByLocation(records, employees, 2026)

  assert.deepEqual(groups.map(group => group.locationId), ['CrestonMS', 'StonyBrkMS', 'unassigned'])
  assert.equal(groups.reduce((total, group) => total + group.staffCount, 0), employees.length)

  const creston = groups[0]
  assert.deepEqual(creston.rows.map(row => row.employee.last_name), ['Alpha', 'Zeta'], 'sorted by surname')
  assert.deepEqual(
    { met: creston.metCount, short: creston.shortCount, unset: creston.unsetCount, hours: creston.totalHours },
    { met: 1, short: 1, unset: 0, hours: 6 }
  )
  assert.equal(groups[1].unsetCount, 1, 'an unknown title counts as unset, not as compliant')
})

test('hours read the way people write them', () => {
  assert.equal(formatTrainingHours(6), '6')
  assert.equal(formatTrainingHours(0.25), '0.25')
  assert.equal(formatTrainingHours(1.5), '1.5')
  assert.equal(formatTrainingHours(0), '0')
})

test('corrupt stored training reads as empty rather than throwing', () => {
  localStorage.setItem('training-records-v1', 'not json')
  assert.deepEqual(getAllTrainingRecords(), [])
  localStorage.setItem('training-records-v1', '[1,2,3]')
  assert.deepEqual(getAllTrainingRecords(), [])
})

test('an edit keeps the record identity and authorship, and stamps who changed it', () => {
  const saved = addTrainingRecord(VALID, { createdBy: 'Liz' })
  flushPendingWrites()

  const edited = updateTrainingRecord(saved.id, { ...VALID, hours: 2, title: 'Allergen awareness (revised)' }, { updatedBy: 'Marrese' })
  flushPendingWrites()

  assert.equal(edited.id, saved.id, 'same record, not a new one')
  assert.equal(edited.createdAt, saved.createdAt)
  assert.equal(edited.createdBy, 'Liz', 'original author preserved')
  assert.equal(edited.updatedBy, 'Marrese')
  assert.match(edited.updatedAt, /^\d{4}-\d{2}-\d{2}T/)

  const all = getAllTrainingRecords()
  assert.equal(all.length, 1, 'edited in place rather than duplicated')
  assert.equal(all[0].hours, 2)
})

// A correction must not be able to produce a record the form would refuse.
test('an edit is validated as strictly as a new entry', () => {
  const saved = addTrainingRecord(VALID, { createdBy: 'Liz' })
  flushPendingWrites()
  assert.throws(() => updateTrainingRecord(saved.id, { ...VALID, hours: 0.37 }), /15-minute increments/)
  assert.throws(() => updateTrainingRecord(saved.id, { ...VALID, employeeIds: [] }), /who attended/)
  assert.throws(() => updateTrainingRecord('no-such-record', VALID), /no longer exists/)
  flushPendingWrites()
  assert.equal(getAllTrainingRecords()[0].hours, VALID.hours, 'a refused edit changes nothing')
})

test('editing the hours moves the totals it already gave', () => {
  const employees = [{ id: '1001', kronos_id: '1001', position: 'Cook', location: 'CrestonMS' }]
  const saved = addTrainingRecord({ ...VALID, hours: 6 }, { createdBy: 'Liz' })
  flushPendingWrites()
  assert.equal(trainingSummaryForEmployees(getAllTrainingRecords(), employees, 2026)[0].status, 'met')

  updateTrainingRecord(saved.id, { ...VALID, hours: 1 }, { updatedBy: 'Liz' })
  flushPendingWrites()
  const [row] = trainingSummaryForEmployees(getAllTrainingRecords(), employees, 2026)
  assert.equal(row.earned, 1)
  assert.equal(row.status, 'short')
})

// Reopening a record should show the shape it was entered in, not 146 ticks.
test('attendee scope is inferred back from the saved list', () => {
  const roster = [
    { id: '1', location: 'A' }, { id: '2', location: 'A' },
    { id: '3', location: 'B' }, { id: '4', location: 'B' },
  ]
  assert.deepEqual(inferAttendeeScope(['1', '2', '3', '4'], roster), { scope: 'all', schools: [] })
  assert.deepEqual(inferAttendeeScope(['1', '2'], roster), { scope: 'schools', schools: ['A'] })
  assert.deepEqual(inferAttendeeScope(['1', '2', '3'], roster), { scope: 'people', schools: [] })
  assert.deepEqual(inferAttendeeScope(['1', '3'], roster), { scope: 'people', schools: [] })
  assert.deepEqual(inferAttendeeScope([], roster), { scope: 'people', schools: [] })
  assert.deepEqual(inferAttendeeScope(['1'], []), { scope: 'people', schools: [] })
})

test('the report builds three sheets that answer three different questions', () => {
  const employees = [
    { id: '1', kronos_id: '1', position: 'Cook', location: 'CrestonMS', last_name: 'Alpha', first_name: 'Ann' },
    { id: '2', kronos_id: '2', position: 'Food Service Worker Lead', location: 'CrestonMS', last_name: 'Beta', first_name: 'Bo' },
  ]
  const records = [training({ hours: 6, employeeIds: ['1'] })]
  const groups = trainingSummaryByLocation(records, employees, 2026)
  const name = id => (id === 'CrestonMS' ? 'Creston MS' : id)

  const [summary] = buildTrainingSummarySheet(groups, name)
  assert.equal(summary.School, 'Creston MS')
  assert.deepEqual(
    { staff: summary.Staff, hours: summary['Hours recorded'], met: summary['Requirement met'] },
    { staff: 2, hours: 6, met: 1 }
  )

  const people = buildTrainingEmployeeSheet(groups, name)
  assert.equal(people.length, 2)
  assert.equal(people[0].Status, 'Met')
  assert.equal(people[1]['Hours required'], 10, 'a Lead needs ten hours')
  assert.equal(people[1].Status, 'Short')

  const [log] = buildTrainingLogSheet(records, id => `Person ${id}`)
  assert.equal(log.Training, 'Allergen awareness')
  assert.equal(log.Type, 'In-Service')
  assert.equal(log.Areas, 'Nutrition')
  assert.equal(log.Attended, 1)
  assert.equal(log.Employees, 'Person 1')
})

test('the report says on its face what period it covers', () => {
  const header = buildTrainingReportHeader(2026, new Date('2027-01-05T12:00:00Z'))
  assert.match(header[1][0], /2026-2027/)
  assert.match(header[1][0], /1 July 2026 to 30 June 2027/)
  assert.match(header[2][0], /2027-01-05/)
  assert.equal(trainingReportFilename(2026), 'professional-standards-2026-2027.xlsx')
})

// An unassigned group must still be labelled, not left blank in a state report.
test('staff with no school are labelled rather than left empty', () => {
  const employees = [{ id: '9', kronos_id: '9', position: 'Cook', location: '', last_name: 'Nowhere', first_name: 'Ned' }]
  const groups = trainingSummaryByLocation([], employees, 2026)
  assert.equal(buildTrainingSummarySheet(groups)[0].School, 'No school assigned')
  assert.equal(buildTrainingEmployeeSheet(groups)[0].School, 'No school assigned')
})
