import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectMonthExceptions,
  getCurrentMonthBirthdays,
  getUpcomingRequestedTimeOff,
  peopleMarkedOn,
} from './dashboardInsights.js'
import { normalizeBirthday } from './employeeFields.js'

const employees = [
  { id: 1, first_name: 'Avery', last_name: 'Able', birthdate: '08-22' },
  { id: 2, first_name: 'Bailey', last_name: 'Baker', birthdate: '08-05' },
  { id: 3, first_name: 'Casey', last_name: 'Clark', birthdate: '09-05' },
]

test('normalizes birthday input without retaining a birth year', () => {
  assert.equal(normalizeBirthday('8/5'), '08-05')
  assert.equal(normalizeBirthday('1990-08-05'), '08-05')
  assert.throws(() => normalizeBirthday('02-30'), /valid birthday/)
})

test('returns and sorts all birthdays in the current month', () => {
  const birthdays = getCurrentMonthBirthdays(employees, new Date(2026, 7, 19))
  assert.deepEqual(birthdays.map(item => item.employee.id), [2, 1])
})


test('returns future requested time off and excludes other attendance codes', () => {
  const records = {
    1: {
      '2026-08-18': { code: 'RTO' },
      '2026-08-20': { code: 'UNEX' },
      '2026-08-25': { code: 'RTO.5', note: 'Morning only' },
    },
    2: { '2026-09-01': { code: 'RTO' } },
  }

  const timeOff = getUpcomingRequestedTimeOff(employees, employee => records[employee.id], new Date(2026, 7, 19))
  assert.deepEqual(timeOff.map(item => [item.employee.id, item.dateKey]), [
    [1, '2026-08-25'],
    [2, '2026-09-01'],
  ])
})

// Liz, 2026-10-26: the district dashboard counted a month and a building's
// dashboard counted a week, so the same-looking tile meant two things. Both
// now read this one collector.
test('month exceptions take only the named month, oldest first', () => {
  const roster = [
    { kronos_id: 'a', first_name: 'Ann', last_name: 'Zeta' },
    { kronos_id: 'b', first_name: 'Bob', last_name: 'Alpha' },
  ]
  const years = {
    a: { '2026-09-30': { code: 'LI' }, '2026-10-20': { code: 'UNEX', note: 'called' }, '2026-11-01': { code: 'EO' } },
    b: { '2026-10-20': { code: 'BER' }, '2026-10-02': { code: 'NCNS' } },
  }
  const read = (empId, year) => (year === 2026 ? years[empId] : {})

  const list = collectMonthExceptions(roster, '2026-10', read)
  assert.deepEqual(
    list.map(item => `${item.dateKey} ${item.employee.last_name} ${item.code}`),
    // Same day ties break on the employee comparator this module already
    // uses everywhere else, which orders on first name.
    ['2026-10-02 Alpha NCNS', '2026-10-20 Zeta UNEX', '2026-10-20 Alpha BER'],
  )
  assert.equal(list[1].note, 'called')
})

test('who is marked on a day is the people with a code that day, by name', () => {
  const roster = [
    { kronos_id: 'emp-zeta', first_name: 'Ann', last_name: 'Zeta' },
    { kronos_id: 'emp-alpha', first_name: 'Bob', last_name: 'Alpha' },
    { kronos_id: 'emp-blank', first_name: 'Cara', last_name: 'Blank' },
  ]
  const records = {
    'emp-zeta': { '2026-11-11': { code: 'RTO', note: 'Appointment' }, '2026-11-10': { code: 'LI' } },
    'emp-alpha': { '2026-11-11': { code: 'LI' } },
    'emp-blank': { '2026-11-11': { code: '' } },
  }
  const read = (empId, dateKey) => records[empId]?.[dateKey]

  const marked = peopleMarkedOn(roster, '2026-11-11', read)
  assert.deepEqual(
    marked.map(item => `${item.employee.last_name} ${item.code}`),
    ['Alpha LI', 'Zeta RTO'],
  )
  assert.equal(marked[1].note, 'Appointment')
  assert.deepEqual(peopleMarkedOn(roster, '2026-11-12', read), [])
  assert.deepEqual(peopleMarkedOn(null, '2026-11-11', read), [])
  assert.deepEqual(peopleMarkedOn(roster, 'today', read), [])
})

test('a month with nothing marked collects nothing rather than throwing', () => {
  assert.deepEqual(collectMonthExceptions([{ kronos_id: 'a' }], '2026-12', () => null), [])
  assert.deepEqual(collectMonthExceptions(null, '2026-12', () => ({})), [])
})
