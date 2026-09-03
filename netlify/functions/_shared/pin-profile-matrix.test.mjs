import test from 'node:test'
import assert from 'node:assert/strict'
import employees from '../../../src/data/employees.json' with { type: 'json' }
import { LOCATIONS } from '../../../src/data/locations.js'
import { createSessionToken, sessionFromRequest } from './auth.mjs'
import { registerServerSession } from './server-session.mjs'
import { createMemoryBlobStore } from './test-blob-store.mjs'
import { handleSessionRequest } from '../session.mjs'
import { handleStateRequest } from '../state.mjs'
import { canWriteStateKey } from './permissions.mjs'

const SCHOOLS = LOCATIONS.filter(location => location.id !== 'Admin')

function stateStore(entries) {
  const values = new Map(Object.entries(entries))
  return {
    async list() { return { blobs: [...values.keys()].map(key => ({ key })) } },
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null },
    async setJSON(key, value) { values.set(key, structuredClone(value)) },
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

function recognitionFor(employee, suffix) {
  const employeeId = String(employee.kronos_id || employee.id)
  return {
    id: `star-${suffix}`,
    employeeId,
    locationId: employee.location,
    type: 'star-of-day',
    date: '2026-08-27',
    monthKey: null,
    criteria: ['Service'],
    note: '',
    sourceName: '',
    recognizedBy: 'Matrix Test',
    createdAt: '2026-08-27T12:00:00.000Z',
  }
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
      // Building managers record their own team's stars (Liz, 2026-09-02).
      assert.equal(body.access.canEditRecognition, true)
      // The district award stays out of reach.
      assert.equal(body.access.canManageRecognitionAwards, false)
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

// The district office is a building with staff of its own. Its manager login is
// scoped to that building, so it marks those employees without seeing the other
// fourteen schools the way a district administrator does.
test('the district office signs in as a building, scoped to its own staff', async () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
    6301: { role: 'school', locationId: 'Admin', displayName: 'District Office Manager' },
  })
  process.env.ATTENDANCE_SESSION_SECRET = 'matrix-test-session-secret-that-is-long-enough'

  try {
    const stores = { rate: createMemoryBlobStore(), sessions: createMemoryBlobStore() }
    const response = await handleSessionRequest(new Request('https://example.test/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '6301' }),
    }), { ip: '198.51.100.90' }, stores)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.access.role, 'school')
    assert.equal(body.access.locationId, 'Admin')
    // Scoped like any other building: no district-wide management.
    assert.equal(body.access.canManageRoster, false)
    assert.equal(body.access.canManageBlackouts, false)
  } finally {
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('a school with read-only attendance still receives live recognition access', async () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_ACCESS_CODES_JSON = JSON.stringify({
    6210: {
      role: 'school',
      locationId: 'Creston',
      displayName: 'Creston Recognition',
      canEditAttendance: false,
      canEditRecognition: false,
    },
  })
  process.env.ATTENDANCE_SESSION_SECRET = 'matrix-test-session-secret-that-is-long-enough'

  try {
    const stores = { rate: createMemoryBlobStore(), sessions: createMemoryBlobStore() }
    const response = await handleSessionRequest(new Request('https://example.test/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '6210' }),
    }), { ip: '198.51.100.91' }, stores)
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.access.role, 'school')
    assert.equal(body.access.locationId, 'CrestonMS')
    assert.equal(body.access.canEditAttendance, false)
    assert.equal(body.access.canEditRecognition, true)
    assert.equal(body.access.canManageRecognitionAwards, false)
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
    6203: { role: 'school', locationId: 'Unknown Building' },
    6204: { role: 'viewer' },
    6205: { role: 'school', locationId: 'Creston', recognitionOnly: true, canEditRecognition: true },
  })
  process.env.ATTENDANCE_SESSION_SECRET = 'matrix-test-session-secret-that-is-long-enough'

  try {
    const stores = { rate: createMemoryBlobStore(), sessions: createMemoryBlobStore() }
    for (const [index, pin] of ['6201', '6203', '6204', '6205'].entries()) {
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

test('district, restricted, read-only, pilot, and 4-to-8 digit PIN shapes expose only intended controls', async () => {
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  const profiles = [
    {
      pin: '0077',
      access: { role: 'admin', displayName: 'Liz Admin' },
      expected: {
        canEditAttendance: true,
        canEditRecognition: true,
        canManageRecognitionAwards: true,
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
        canEditRecognition: true,
        canManageRecognitionAwards: false,
        canManageRoster: false,
        canManageBlackouts: false,
      },
    },
    {
      pin: '730123',
      access: { role: 'admin', displayName: 'Read-only Review', canEditAttendance: false },
      expected: {
        canEditAttendance: false,
        canEditRecognition: false,
        canManageRecognitionAwards: false,
        canManageRoster: false,
        canManageBlackouts: false,
      },
    },
    {
      pin: '7301234',
      access: {
        role: 'admin',
        displayName: 'Recognition Pilot',
        recognitionOnly: true,
        canEditRecognition: true,
      },
      expected: {
        canEditAttendance: false,
        canEditRecognition: true,
        canManageRecognitionAwards: false,
        canManageRoster: false,
        canManageBlackouts: false,
      },
    },
    {
      pin: '73012345',
      access: {
        role: 'admin',
        displayName: 'Authorized Award Pilot',
        canManageRoster: false,
        canManageBlackouts: false,
        canManageRecognitionAwards: true,
      },
      expected: {
        canEditAttendance: true,
        canEditRecognition: true,
        canManageRecognitionAwards: true,
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
      assert.equal(body.access.role, 'admin')
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

test('all 15 building sessions receive only their roster and no recognition records', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  process.env.ATTENDANCE_SESSION_SECRET = 'matrix-test-session-secret-that-is-long-enough'
  delete process.env.ATTENDANCE_ACCESS_CODES_JSON

  const recognitions = Object.fromEntries(SCHOOLS.map((school, index) => {
    const employee = employees.find(row => row.location === school.id)
    assert.ok(employee, `${school.name} needs at least one roster employee`)
    const recognition = recognitionFor(employee, index)
    return [recognition.id, recognition]
  }))
  const store = stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'all-star-recognition-v1': recognitions,
  })

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

      // School managers read their own building's board only. Every other
      // building's stars must stay out of the payload, and writing recognition
      // remains refused for them (permissions.test.mjs covers the write side).
      const rosterIds = new Set(
        employees.filter(employee => employee.location === school.id)
          .map(employee => String(employee.kronos_id || employee.id))
      )
      const visible = Object.values(body.entries['all-star-recognition-v1'] || {})
      assert.ok(visible.length > 0, `${school.name} should see its own recognition`)
      assert.ok(
        visible.every(record => rosterIds.has(String(record.employeeId))),
        `${school.name} must not receive another building's recognition`
      )
    }
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
  }
})

test('school sessions read only their own building recognition board', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  const previousCodes = process.env.ATTENDANCE_ACCESS_CODES_JSON
  process.env.ATTENDANCE_SESSION_SECRET = 'matrix-test-session-secret-that-is-long-enough'
  delete process.env.ATTENDANCE_ACCESS_CODES_JSON

  const targetSchool = SCHOOLS[0]
  const otherSchool = SCHOOLS[1]
  const targetRecognition = recognitionFor(
    employees.find(employee => employee.location === targetSchool.id),
    'target'
  )
  const otherRecognition = recognitionFor(
    employees.find(employee => employee.location === otherSchool.id),
    'other'
  )
  const store = stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'all-star-recognition-v1': {
      [targetRecognition.id]: targetRecognition,
      [otherRecognition.id]: otherRecognition,
    },
  })

  try {
    const sessions = createMemoryBlobStore()
    const request = await authenticatedRequest({
      role: 'school',
      locationId: targetSchool.id,
      canEditRecognition: true,
      displayName: 'Legacy School Manager',
    }, sessions)
    const response = await handleStateRequest(request, { stateStore: store, sessionStore: sessions })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.ok(body.roster.every(employee => employee.location === targetSchool.id))

    // A school PIN reads its own building's board and nothing more. Recording
    // stars is now theirs (Liz, 2026-09-02), but that does not widen what they
    // can see: another building's records stay invisible.
    const visible = Object.values(body.entries['all-star-recognition-v1'] || {})
    assert.deepEqual(visible.map(record => record.id), [targetRecognition.id])
    assert.equal(
      canWriteStateKey({ role: 'school', canEditRecognition: true }, 'all-star-recognition-v1'),
      true
    )
    // Reaching the key is not reaching another building's staff: a session that
    // never had recognition edit rights still cannot write.
    assert.equal(
      canWriteStateKey({ role: 'school', canEditRecognition: false }, 'all-star-recognition-v1'),
      false
    )
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
    if (previousCodes === undefined) delete process.env.ATTENDANCE_ACCESS_CODES_JSON
    else process.env.ATTENDANCE_ACCESS_CODES_JSON = previousCodes
  }
})
