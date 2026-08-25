import test from 'node:test'
import assert from 'node:assert/strict'
import { accessForPin } from './auth.mjs'
import { EMPLOYEE_NOTES_KEY, canWriteStateKey } from './permissions.mjs'

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

const readOnlyDistrictViewer = {
  role: 'admin',
  canEditAttendance: false,
  canManageRoster: false,
  canManageBlackouts: false,
}

test('Liz can manage attendance, employee records, and blackout dates', () => {
  assert.equal(canWriteStateKey(liz, 'att-emp-123-2026'), true)
  assert.equal(canWriteStateKey(liz, EMPLOYEE_NOTES_KEY), true)
  assert.equal(canWriteStateKey(liz, 'employee-record-overrides'), true)
  assert.equal(canWriteStateKey(liz, 'attendance-blackout-dates'), true)
})

test('limited district administrators can mark attendance and write HR notes without changing protected records', () => {
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'att-emp-123-2026'), true)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, EMPLOYEE_NOTES_KEY), true)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'employee-record-overrides'), false)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'employee-custom-records'), false)
  assert.equal(canWriteStateKey(limitedDistrictAdmin, 'attendance-blackout-dates'), false)
})

test('read-only district viewers cannot change attendance or protected records', () => {
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, 'att-emp-123-2026'), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, 'hr-attendance-progress-v2'), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, EMPLOYEE_NOTES_KEY), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, 'employee-record-overrides'), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, 'employee-custom-records'), false)
  assert.equal(canWriteStateKey(readOnlyDistrictViewer, 'attendance-blackout-dates'), false)
})

test('PIN configuration can issue plain and Localis-watermarked read-only access', () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
    1111: {
      role: 'admin',
      displayName: 'Read-Only Review',
      canEditAttendance: false,
      canManageRoster: false,
      canManageBlackouts: false,
    },
    2222: {
      role: 'admin',
      displayName: 'Localis Collective Review',
      canEditAttendance: false,
      canManageRoster: false,
      canManageBlackouts: false,
      watermark: 'localis',
    },
  })

  try {
    const plain = accessForPin('1111')
    const watermarked = accessForPin('2222')
    assert.equal(plain.canEditAttendance, false)
    assert.equal(plain.canWriteEmployeeNotes, false)
    assert.equal(plain.watermark, null)
    assert.equal(watermarked.canEditAttendance, false)
    assert.equal(watermarked.watermark, 'localis')
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
  }
})

test('school managers can only write attendance for employees in their school', () => {
  const schoolManager = { role: 'school' }
  const allowedEmployeeIds = new Set(['123'])

  assert.equal(canWriteStateKey(schoolManager, 'att-emp-123-2026', allowedEmployeeIds), true)
  assert.equal(canWriteStateKey(schoolManager, 'att-emp-456-2026', allowedEmployeeIds), false)
  assert.equal(canWriteStateKey(schoolManager, EMPLOYEE_NOTES_KEY, allowedEmployeeIds), false)
  assert.equal(canWriteStateKey(schoolManager, 'attendance-blackout-dates', allowedEmployeeIds), false)
  assert.equal(canWriteStateKey(schoolManager, 'employee-location-overrides', allowedEmployeeIds), false)
})
