import assert from 'node:assert/strict'
import test from 'node:test'
import { isUpdateAvailable, shouldReloadForUpdate } from './appVersion.js'

function makeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
  }
}

test('an update is available only when both ids are known and differ', () => {
  assert.equal(isUpdateAvailable('abc123', 'def456'), true)
  assert.equal(isUpdateAvailable('abc123', 'abc123'), false)
  assert.equal(isUpdateAvailable(null, 'def456'), false)
  assert.equal(isUpdateAvailable('abc123', null), false)
  assert.equal(isUpdateAvailable('abc123', undefined), false)
})

test('local dev builds never trigger a reload', () => {
  assert.equal(isUpdateAvailable('local-1725000000000', 'def456'), false)
})

test('a tab reloads once per deployed build, never in a loop', () => {
  const storage = makeStorage()

  assert.equal(shouldReloadForUpdate('abc123', 'def456', storage), true)
  // Same mismatch again (reload did not help): do not reload a second time.
  assert.equal(shouldReloadForUpdate('abc123', 'def456', storage), false)
  // A newer deploy appears: one more reload is allowed.
  assert.equal(shouldReloadForUpdate('abc123', 'fed789', storage), true)
})

test('matching builds never mark the reload guard', () => {
  const storage = makeStorage()
  assert.equal(shouldReloadForUpdate('abc123', 'abc123', storage), false)
  assert.equal(storage.getItem('attendance-reloaded-for-build'), null)
})

test('a storage failure fails safe to no reload', () => {
  const storage = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }
  assert.equal(shouldReloadForUpdate('abc123', 'def456', storage), false)
})
