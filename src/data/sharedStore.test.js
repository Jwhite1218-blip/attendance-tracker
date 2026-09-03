import assert from 'node:assert/strict'
import test from 'node:test'
import { canWriteManagedKeyForAccess } from './sharedStore.js'

test('school recognition access is writable even when attendance is read-only', () => {
  const access = {
    role: 'school',
    canEditAttendance: false,
    canEditRecognition: true,
  }

  assert.equal(canWriteManagedKeyForAccess(access, 'all-star-recognition-v1'), true)
  assert.equal(canWriteManagedKeyForAccess(access, 'att-emp-123-2026'), false)
  assert.equal(canWriteManagedKeyForAccess(access, 'attendance-blackout-dates'), false)
  assert.equal(canWriteManagedKeyForAccess(access, 'employee-record-overrides'), false)
})

test('recognition writes still require an approved role and capability', () => {
  assert.equal(canWriteManagedKeyForAccess({ role: 'school', canEditRecognition: false }, 'all-star-recognition-v1'), false)
  assert.equal(canWriteManagedKeyForAccess({ role: 'viewer', canEditRecognition: true }, 'all-star-recognition-v1'), false)
  assert.equal(canWriteManagedKeyForAccess({ role: 'admin', canEditRecognition: true }, 'all-star-recognition-v1'), true)
})
