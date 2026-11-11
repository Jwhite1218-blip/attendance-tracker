import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canWriteManagedKeyForAccess,
  configureClientAccess,
  flushPendingWrites,
  writeSharedStorage,
} from './sharedStore.js'
import { installTestBrowserStorage } from './testBrowserStorage.js'

test('school recognition access is writable even when attendance is read-only', () => {
  const access = {
    role: 'school',
    canEditAttendance: false,
    canEditRecognition: true,
  }

  assert.equal(canWriteManagedKeyForAccess(access, 'all-star-recognition-v1'), true)
  assert.equal(canWriteManagedKeyForAccess(access, 'star-card-prints-v1'), true)
  assert.equal(canWriteManagedKeyForAccess(access, 'att-emp-123-2026'), false)
  assert.equal(canWriteManagedKeyForAccess(access, 'attendance-blackout-dates'), false)
  assert.equal(canWriteManagedKeyForAccess(access, 'employee-record-overrides'), false)
})

test('recognition writes still require an approved role and capability', () => {
  assert.equal(canWriteManagedKeyForAccess({ role: 'school', canEditRecognition: false }, 'all-star-recognition-v1'), false)
  assert.equal(canWriteManagedKeyForAccess({ role: 'school', canEditRecognition: false }, 'star-card-prints-v1'), false)
  assert.equal(canWriteManagedKeyForAccess({ role: 'viewer', canEditRecognition: true }, 'all-star-recognition-v1'), false)
  assert.equal(canWriteManagedKeyForAccess({ role: 'admin', canEditRecognition: true }, 'all-star-recognition-v1'), true)
})

// 2026-10-19: a state key the database did not admit was rejected with a 400,
// surfaced as a 503, retried on every sign-in, and — because the throw
// escaped the flush loop — blocked every write queued behind it. The visible
// symptom was "the shared attendance service is temporarily unavailable" on
// sign-in, for a missing migration.
test('a permanently rejected write is dropped instead of blocking the queue', async () => {
  installTestBrowserStorage()
  configureClientAccess({ role: 'admin', canEditAttendance: true, canManageRoster: true, canManageBlackouts: true })

  const attempts = []
  globalThis.fetch = async (url, options = {}) => {
    const body = JSON.parse(options.body || '{}')
    attempts.push(body.key)
    if (body.key === 'program-settings-v1') {
      return {
        ok: false,
        status: 422,
        json: async () => ({ error: 'That change was refused and cannot be retried.', permanent: true }),
      }
    }
    return { ok: true, status: 200, json: async () => ({ value: body.mutation?.value ?? {} }) }
  }

  writeSharedStorage('program-settings-v1', { starLevels: [] })
  writeSharedStorage('attendance-blackout-dates', [{ date: '2026-12-24' }])
  await flushPendingWrites()

  assert.ok(attempts.includes('program-settings-v1'), 'the rejected key was tried')
  assert.ok(attempts.includes('attendance-blackout-dates'), 'the write behind it still went out')

  // And it does not come back on the next flush.
  const before = attempts.length
  await flushPendingWrites()
  assert.equal(attempts.length, before, 'nothing is retried')
  assert.equal(localStorage.getItem('attendance-pending-sync-v1'), null, 'the queue is empty')
})

test('a transient failure keeps the write queued for later', async () => {
  installTestBrowserStorage()
  configureClientAccess({ role: 'admin', canEditAttendance: true, canManageRoster: true, canManageBlackouts: true })

  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ error: 'The shared attendance service is temporarily unavailable.' }),
  })

  writeSharedStorage('attendance-blackout-dates', [{ date: '2026-12-24' }])
  await assert.rejects(() => flushPendingWrites())

  const queued = JSON.parse(localStorage.getItem('attendance-pending-sync-v1') || '{}')
  assert.ok(queued['attendance-blackout-dates'], 'still queued, because a 503 might clear up')
})
