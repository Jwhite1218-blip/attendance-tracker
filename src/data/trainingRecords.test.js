import assert from 'node:assert/strict'
import test from 'node:test'
import { configureClientAccess, flushPendingWrites } from './sharedStore.js'
import {
  addTrainingRecord,
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
