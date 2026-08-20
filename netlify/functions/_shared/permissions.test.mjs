import test from 'node:test'
import assert from 'node:assert/strict'
import { canWriteStateKey } from './permissions.mjs'

const liz = {
  role: 'admin',
  canManageRoster: true,
  canManageBlackouts: true,
}

const limitedDistrictAdmin = {
  role: 'admin',
  canManageRoster: false,
  canManageBlackouts: false,
}

test('Liz can manage attendance, employee records, and blackout dates', () => {
  assert.equal(canWriteStateKey(liz, 'att-emp-123-2026'), true)
  assert.equal(canWriteStateKey(liz, 'employee-record-overrides'), true)
  assert.equal(canWriteStateKey(liz, 'attendance-blackout-dates'), true)
})

test('limited district administrators can mark attendance but cannot change protected records', () => {
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'att-emp-123-2026'), true)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'employee-record-overrides'), false)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'employee-custom-records'), false)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'attendance-blackout-dates'), false)
})

test('school managers can only write attendance for employees in their school', () => {
  const schoolManager = { role: 'school' }
  const allowedEmployeeIds = new Set(['123'])

  assert.equal(canWriteStateKey(schoolManager, 'att-emp-123-2026', allowedEmployeeIds), true)
  assert.equal(canWriteStateKey(schoolManager, 'att-emp-456-2026', allowedEmployeeIds), false)
  assert.equal(canWriteStateKey(schoolManager, 'attendance-blackout-dates', allowedEmployeeIds), false)
  assert.equal(canWriteStateKey(schoolManager, 'employee-location-overrides', allowedEmployeeIds), false)
})
