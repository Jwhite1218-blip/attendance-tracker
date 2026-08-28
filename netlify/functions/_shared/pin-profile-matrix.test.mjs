import test from 'node:test'
import assert from 'node:assert/strict'
import employees from '../../../src/data/employees.json' with { type: 'json' }
import { LOCATIONS } from '../../../src/data/locations.js'
import { createSessionToken, sessionFromRequest } from './auth.mjs'
import { registerServerSession } from './server-session.mjs'
import { createMemoryBlobStore } from './test-blob-store.mjs'
import { handleSessionRequest } from '../session.mjs'
import { handleStateRequest } from '../state.mjs'

const SCHOOLS = LOCATIONS.filter(location => location.id !== 'Admin')

function stateStore(entries) {
  const values = new Map(Object.entries(entries))
  return {
    async list() { return { blobs: [...values.keys()].map(key => ({ key })) } },
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null },
    async updateJSON(key, mutation) {
      const { applyStateMutation } = await import('../../../src/data/stateMutations.js')
      const value = applyStateMutation(key, values.get(key) ?? null, mutation)
      values.set(key, value)
      return structuredClone(value)
    },
  }
}

async function authenticatedRequest(access, sessions) {
  const token = createSessionToken(access)
  const cookie = `attendance-session=${encodeURIComponent(token)}`
  const request = new Request('https://example.test/api/state', { headers: { cookie } })
  await registerServerSession(sessionFromRequest(request), sessions)
  return request
}

test('every school PIN variation logs in with its canonical building and safe capabilities', async () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  const codes = {}
  const expected = []

  for (const [index, school] of SCHOOLS.entries()) {
    const pin = String(5100 + index)
    const variations = [school.id.toLowerCase(), school.name, school.shortName]
    codes[pin] = {
      role: 'school',
      displayName: `${school.shortName} Manager`,
      locationId: variations[index % variations.length],
    }
    expected.push({ pin, school })
  }

  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify(codes)
  process.env.ATTENDANCE_SESSION_SECRET = 'matrix-test-session-secret-that-is-long-enough'

  try {
    const stores = { rate: createMemoryBlobStore(), sessions: createMemoryBlobStore() }
    for (const [index, { pin, school }] of expected.entries()) {
      const response = await handleSessionRequest(new Request('https://example.test/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      }), { ip: `203.0.113.${index + 1}` }, stores)
      const body = await response.json()

      assert.equal(response.status, 200, `${school.name} PIN should log in`)
      assert.equal(body.access.role, 'school')
      assert.equal(body.access.locationId, school.id)
      assert.equal(body.access.canEditAttendance, true)
      assert.equal(body.access.canWriteEmployeeNotes, false)
      assert.equal(body.access.canManageRoster, false)
      assert.equal(body.access.canManageBlackouts, false)
    }
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('invalid school and role PIN profiles are rejected instead of opening a broken dashboard', async () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
    6201: { role: 'school' },
    6202: { role: 'school', locationId: 'Admin' },
    6203: { role: 'school', locationId: 'Unknown Building' },
    6204: { role: 'viewer' },
  })
  process.env.ATTENDANCE_SESSION_SECRET = 'matrix-test-session-secret-that-is-long-enough'

  try {
    const stores = { rate: createMemoryBlobStore(), sessions: createMemoryBlobStore() }
    for (const [index, pin] of ['6201', '6202', '6203', '6204'].entries()) {
      const response = await handleSessionRequest(new Request('https://example.test/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      }), { ip: `198.51.100.${index + 1}` }, stores)
      assert.equal(response.status, 401)
    }
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('district, restricted, read-only, and 4-to-8 digit PIN shapes expose only intended controls', async () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  const profiles = [
    {
      pin: '0077',
      access: { role: 'admin', displayName: 'Liz Admin' },
      expected: {
        canEditAttendance: true,
        canWriteEmployeeNotes: true,
        canManageRoster: true,
        canManageBlackouts: true,
      },
    },
    {
      pin: '73012',
      access: {
        role: 'admin',
        displayName: 'Restricted District Manager',
        canManageRoster: false,
        canManageBlackouts: false,
      },
      expected: {
        canEditAttendance: true,
        canWriteEmployeeNotes: true,
        canManageRoster: false,
        canManageBlackouts: false,
      },
    },
    {
      pin: '730123',
      access: { role: 'admin', displayName: 'Read-only Review', canEditAttendance: false },
      expected: {
        canEditAttendance: false,
        canWriteEmployeeNotes: false,
        canManageRoster: false,
        canManageBlackouts: false,
      },
    },
    {
      pin: '7301234',
      access: { role: 'school', displayName: 'School Manager', locationId: 'Sunny Heights' },
      expected: {
        canEditAttendance: true,
        canWriteEmployeeNotes: false,
        canManageRoster: false,
        canManageBlackouts: false,
      },
    },
    {
      pin: '73012345',
      access: {
        role: 'admin',
        displayName: 'Explicitly Restricted Administrator',
        canManageRoster: false,
        canManageBlackouts: false,
      },
      expected: {
        canEditAttendance: true,
        canWriteEmployeeNotes: true,
        canManageRoster: false,
        canManageBlackouts: false,
      },
    },
  ]
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify(Object.fromEntries(
    profiles.map(profile => [profile.pin, profile.access])
  ))
  process.env.ATTENDANCE_SESSION_SECRET = 'matrix-test-session-secret-that-is-long-enough'

  try {
    const stores = { rate: createMemoryBlobStore(), sessions: createMemoryBlobStore() }
    for (const [index, profile] of profiles.entries()) {
      const response = await handleSessionRequest(new Request('https://example.test/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: profile.pin }),
      }), { ip: `192.0.2.${index + 1}` }, stores)
      const body = await response.json()
      assert.equal(response.status, 200)
      for (const [capability, expected] of Object.entries(profile.expected)) {
        assert.equal(body.access[capability], expected, `${profile.access.displayName}: ${capability}`)
      }
    }
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('all 15 building sessions receive only their own roster', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  process.env.ATTENDANCE_SESSION_SECRET = 'matrix-test-session-secret-that-is-long-enough'
  delete process.env.ATTENDANCE_ACCESS_CODES_JSON

  const store = stateStore({ __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' } })

  try {
    for (const school of SCHOOLS) {
      const sessions = createMemoryBlobStore()
      const request = await authenticatedRequest({
        role: 'school',
        locationId: school.id,
        displayName: `${school.shortName} Manager`,
        canEditAttendance: true,
      }, sessions)
      const response = await handleStateRequest(request, { stateStore: store, sessionStore: sessions })
      const body = await response.json()
      const expectedRosterCount = employees.filter(employee => employee.location === school.id).length

      assert.equal(response.status, 200)
      assert.equal(body.roster.length, expectedRosterCount, `${school.name} roster count`)
      assert.ok(body.roster.every(employee => employee.location === school.id))
    }
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
  }
})
