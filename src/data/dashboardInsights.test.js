import test from 'node:test'
import assert from 'node:assert/strict'
import { getCurrentMonthBirthdays, getUpcomingRequestedTimeOff } from './dashboardInsights.js'
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
