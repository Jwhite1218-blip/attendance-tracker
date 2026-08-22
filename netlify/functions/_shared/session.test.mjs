import test from 'node:test'
import assert from 'node:assert/strict'
import { handleSessionRequest } from '../session.mjs'
import { createMemoryBlobStore } from './test-blob-store.mjs'

function loginRequest(pin) {
  return new Request('https://example.test/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  })
}

test('rate limiting is atomic, does not let one wrong PIN lock the valid PIN, and logout revokes replay', async () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
    609106: { role: 'admin', displayName: 'Test Admin' },
  })
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'

  try {
    const stores = { rate: createMemoryBlobStore(), sessions: createMemoryBlobStore() }
    const attempts = await Promise.all(
      Array.from({ length: 30 }, () => handleSessionRequest(loginRequest('111111'), { ip: '203.0.113.10' }, stores))
    )
    const statuses = attempts.map(response => response.status)
    assert.equal(statuses.filter(status => status === 401).length, 5)
    assert.equal(statuses.filter(status => status === 429).length, 25)

    const login = await handleSessionRequest(loginRequest('609106'), { ip: '203.0.113.10' }, stores)
    assert.equal(login.status, 200)
    const cookie = login.headers.get('set-cookie').split(';')[0]

    const authenticated = new Request('https://example.test/api/session', { headers: { cookie } })
    assert.equal((await handleSessionRequest(authenticated, {}, stores)).status, 200)

    const logout = new Request('https://example.test/api/session', { method: 'DELETE', headers: { cookie } })
    assert.equal((await handleSessionRequest(logout, {}, stores)).status, 200)
    assert.equal((await handleSessionRequest(authenticated, {}, stores)).status, 401)
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})
