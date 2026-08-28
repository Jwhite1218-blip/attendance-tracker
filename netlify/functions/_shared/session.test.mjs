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
    assert.equal((await login.clone().json()).access.canWriteEmployeeNotes, true)
    const cookie = login.headers.get('set-cookie').split(';')[0]

    const authenticated = new Request('https://example.test/api/session', { headers: { cookie } })
    const authenticatedResponse = await handleSessionRequest(authenticated, {}, stores)
    assert.equal(authenticatedResponse.status, 200)
    assert.equal((await authenticatedResponse.json()).access.canWriteEmployeeNotes, true)

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

test('replacing Liz PIN revokes her existing session without logging out other staff', async () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  const previousReplacement = process.env.ATTENDANCE_LIZ_REPLACEMENT_PIN
  const previousLizEmployeeId = process.env.ATTENDANCE_LIZ_EMPLOYEE_ID
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
    4101: {
      role: 'admin',
      displayName: 'Elizabeth Schmitt',
      employeeId: 'emp-pwsfc85t',
      canManageRoster: true,
      canManageBlackouts: true,
    },
    4102: {
      role: 'school',
      displayName: 'School Manager',
      locationId: 'CrestonMS',
    },
  })
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  process.env.ATTENDANCE_LIZ_EMPLOYEE_ID = 'emp-pwsfc85t'
  delete process.env.ATTENDANCE_LIZ_REPLACEMENT_PIN

  try {
    const stores = { rate: createMemoryBlobStore(), sessions: createMemoryBlobStore() }
    const lizLogin = await handleSessionRequest(loginRequest('4101'), { ip: '203.0.113.20' }, stores)
    const schoolLogin = await handleSessionRequest(loginRequest('4102'), { ip: '203.0.113.21' }, stores)
    assert.equal(lizLogin.status, 200)
    assert.equal(schoolLogin.status, 200)
    const lizCookie = lizLogin.headers.get('set-cookie').split(';')[0]
    const schoolCookie = schoolLogin.headers.get('set-cookie').split(';')[0]

    process.env.ATTENDANCE_LIZ_REPLACEMENT_PIN = '941001'

    const oldLizSession = new Request('https://example.test/api/session', { headers: { cookie: lizCookie } })
    const existingSchoolSession = new Request('https://example.test/api/session', { headers: { cookie: schoolCookie } })
    assert.equal((await handleSessionRequest(oldLizSession, {}, stores)).status, 401)
    assert.equal((await handleSessionRequest(existingSchoolSession, {}, stores)).status, 200)
    assert.equal((await handleSessionRequest(loginRequest('4101'), { ip: '203.0.113.22' }, stores)).status, 401)

    const replacementLogin = await handleSessionRequest(loginRequest('941001'), { ip: '203.0.113.23' }, stores)
    assert.equal(replacementLogin.status, 200)
    const body = await replacementLogin.json()
    assert.equal(body.access.displayName, 'Elizabeth Schmitt')
    assert.equal(body.access.credentialFingerprint, undefined)
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
    if (previousReplacement === undefined) delete process.env.ATTENDANCE_LIZ_REPLACEMENT_PIN
    else process.env.ATTENDANCE_LIZ_REPLACEMENT_PIN = previousReplacement
    if (previousLizEmployeeId === undefined) delete process.env.ATTENDANCE_LIZ_EMPLOYEE_ID
    else process.env.ATTENDANCE_LIZ_EMPLOYEE_ID = previousLizEmployeeId
  }
})

test('active sessions immediately inherit safer capability changes for the same PIN', async () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
    7101: {
      role: 'admin',
      displayName: 'Capability Test',
      canManageRoster: true,
      canManageBlackouts: true,
    },
  })
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'

  try {
    const stores = { rate: createMemoryBlobStore(), sessions: createMemoryBlobStore() }
    const login = await handleSessionRequest(loginRequest('7101'), { ip: '203.0.113.31' }, stores)
    assert.equal(login.status, 200)
    assert.equal((await login.clone().json()).access.canManageRoster, true)
    const cookie = login.headers.get('set-cookie').split(';')[0]

    process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
      7101: {
        role: 'admin',
        displayName: 'Capability Test',
        canManageRoster: false,
        canManageBlackouts: false,
      },
    })

    const authenticated = new Request('https://example.test/api/session', { headers: { cookie } })
    const response = await handleSessionRequest(authenticated, {}, stores)
    const body = await response.json()
    assert.equal(response.status, 200)
    assert.equal(body.access.canManageRoster, false)
    assert.equal(body.access.canManageBlackouts, false)
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})
