import test from 'node:test'
import assert from 'node:assert/strict'
import employees from '../../../src/data/employees.json' with { type: 'json' }
import { createSessionToken, sessionFromRequest } from './auth.mjs'
import { registerServerSession } from './server-session.mjs'
import { createMemoryBlobStore } from './test-blob-store.mjs'
import { handleStateRequest, handleMutate } from '../state.mjs'
import { MANAGER_GRADE_POSITIONS } from '../../../src/data/recognitionStore.js'

// Liz, 2026-10-20: termination date, last day worked and reason were
// removed from the application and the database. They were the HR half of
// this tool and the district keeps that record on its own forms.
//
// The tests they replace asserted that those three fields were required
// before anybody could be marked inactive. What matters now is the opposite:
// that marking somebody inactive needs nothing beyond the flag, and that
// doing so still does not disturb their attendance history.
test('marking somebody inactive needs no reason and no dates', async () => {
  const key = 'employee-record-overrides'
  const attendance = { '2026-09-01': { code: 'RTO' } }
  const store = stateStore({ [key]: {}, 'att-emp-example-2026': attendance })
  const access = { role: 'admin', canManageRoster: true, canManageBlackouts: true }
  const write = record => handleMutate(store, access, { key, mutation: { type: 'object-patch', set: { example: record } } })

  assert.equal((await write({ active: false, inactive_at: '2026-10-20T12:00:00.000Z' })).status, 200)
  assert.deepEqual(await store.get('att-emp-example-2026'), attendance, 'history survives the change')

  // And back again.
  assert.equal((await write({ active: true, inactive_at: null })).status, 200)

  // A building login still cannot change employment status at all.
  assert.equal(
    (await handleMutate(store, { role: 'school', locationId: 'BrookViewE' },
      { key, mutation: { type: 'object-patch', set: { example: { active: false } } } })).status,
    403
  )
})

function stateStore(entries) {
  const values = new Map(Object.entries(entries))
  return {
    async list() { return { blobs: [...values.keys()].map(key => ({ key })) } },
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null },
    async setJSON(key, value) {
      values.set(key, structuredClone(value))
    },
    async updateJSON(key, mutation) {
      const { applyStateMutation } = await import('../../../src/data/stateMutations.js')
      const value = applyStateMutation(key, values.get(key) ?? null, mutation)
      values.set(key, value)
      return structuredClone(value)
    },
  }
}

async function authenticatedRequest(access, sessions, options = {}) {
  const token = createSessionToken(access)
  const cookie = `attendance-session=${encodeURIComponent(token)}`
  const { url = 'https://example.test/api/state', ...requestOptions } = options
  const request = new Request(url, {
    ...requestOptions,
    headers: { cookie, ...(requestOptions.headers || {}) },
  })
  await registerServerSession(sessionFromRequest(request), sessions)
  return request
}

test('authenticated roster omits unused payroll fields and stale merge actions are disabled', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const store = stateStore({ __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' } })
    const request = await authenticatedRequest({ role: 'admin', canEditAttendance: true }, sessions)
    const response = await handleStateRequest(request, { stateStore: store, sessionStore: sessions })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.equal(body.roster.length, employees.length)
    assert.equal(Object.hasOwn(body.roster[0], 'pay_amount'), false)
    assert.equal(Object.hasOwn(body.roster[0], 'weekly_hours'), false)
    assert.equal(Object.hasOwn(body.roster[0], 'department'), false)
    assert.equal(body.roster[0].birthdate, employees[0].birthdate || '')
    assert.equal(body.roster[0].service_date, employees[0].service_date || '')
    assert.equal(Object.hasOwn(body.roster[0], 't_shirt_size'), false)
    // Gone entirely on 2026-10-20, not merely withheld from buildings. The
    // only thing it fed was work anniversaries, the district's own hire
    // dates were not up to date, and the field went with the feature.
    assert.equal(Object.hasOwn(body.roster[0], 'hire_date'), false)

    const mergeRequest = await authenticatedRequest(
      { role: 'admin', canEditAttendance: true, canManageRoster: true, canManageBlackouts: true },
      sessions,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
        body: JSON.stringify({ action: 'merge', entries: {} }),
      }
    )
    assert.equal((await handleStateRequest(mergeRequest, { stateStore: store, sessionStore: sessions })).status, 400)
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('school state filters roster and location overrides to that school', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const schoolEmployee = employees.find(employee => employee.location !== 'Admin')
    const outsider = employees.find(employee => employee.location !== schoolEmployee.location)
    assert.ok(outsider)
    const schoolId = employee => String(employee.kronos_id || employee.id)
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'attendance-blackout-dates': [
        { date: '2026-09-07', label: 'Labor Day' },
      ],
      'employee-location-overrides': {
        [schoolId(schoolEmployee)]: schoolEmployee.location,
        [schoolId(outsider)]: outsider.location,
      },
      'employee-record-overrides': {
        [schoolId(schoolEmployee)]: { notes: 'School-visible note', t_shirt_size: 'XL' },
        [schoolId(outsider)]: { notes: 'Other school note', t_shirt_size: 'S' },
      },
      'employee-manager-notes-v1': {
        [schoolId(schoolEmployee)]: [{ text: 'District HR note', author: 'Liz', at: '2026-08-20T12:00:00.000Z' }],
        [schoolId(outsider)]: [{ text: 'Other district HR note', author: 'Liz', at: '2026-08-20T12:00:00.000Z' }],
      },
      'all-star-recognition-v1': {
        'school-star': {
          id: 'school-star',
          employeeId: schoolId(schoolEmployee),
          locationId: schoolEmployee.location,
          type: 'star-of-day',
          date: '2026-08-20',
          monthKey: null,
          criteria: ['Outstanding customer service'],
          note: 'Great work',
          sourceName: '',
          recognizedBy: 'School Manager',
          createdAt: '2026-08-20T12:00:00.000Z',
        },
        'other-school-star': {
          id: 'other-school-star',
          employeeId: schoolId(outsider),
          locationId: outsider.location,
          type: 'star-of-day',
          date: '2026-08-20',
          monthKey: null,
          criteria: ['Outstanding customer service'],
          note: 'Great work',
          sourceName: '',
          recognizedBy: 'Other Manager',
          createdAt: '2026-08-20T12:00:00.000Z',
        },
      },
      'employee-custom-records': [
        {
          id: 999999,
          kronos_id: 'custom-school-employee',
          first_name: 'Custom',
          last_name: 'Employee',
          location: schoolEmployee.location,
          t_shirt_size: 'M',
        },
      ],
    })
    const request = await authenticatedRequest({
      role: 'school',
      locationId: schoolEmployee.location,
      canEditAttendance: true,
    }, sessions)
    const response = await handleStateRequest(request, { stateStore: store, sessionStore: sessions })
    const body = await response.json()

    assert.equal(response.status, 200)
    assert.ok(body.roster.length > 0)
    // A building also receives the manager pool from 2026-10-19, so that
    // Worker Leads can send each other a Warren Star Shout-Out. Anyone from
    // another building in this payload must be manager-grade.
    assert.ok(body.roster.every(employee => (
      employee.location === schoolEmployee.location
      || MANAGER_GRADE_POSITIONS.includes(String(employee.position || '').trim())
    )))
    assert.equal(Object.hasOwn(body.entries['employee-location-overrides'], schoolId(outsider)), false)
    assert.deepEqual(body.entries['attendance-blackout-dates'], [
      { date: '2026-09-07', label: 'Labor Day' },
    ])
    // Looked up rather than taken from index 0: the roster now carries the
    // manager pool as well, so position in the array means nothing.
    const rosterRow = body.roster.find(row => schoolId(row) === schoolId(schoolEmployee))
    assert.ok(rosterRow, 'the school employee is in their own roster')
    assert.equal(rosterRow.birthdate, schoolEmployee.birthdate || '')
    assert.equal(Object.hasOwn(rosterRow, 'hire_date'), false, 'a school session is not sent hire dates')
    assert.equal(rosterRow.service_date, schoolEmployee.service_date || '')
    // The allowlist still holds for every row, including the managers that
    // are new to this payload.
    for (const row of body.roster) {
      assert.equal(Object.hasOwn(row, 'weekly_hours'), false)
      assert.equal(Object.hasOwn(row, 'pay_amount'), false)
      assert.equal(Object.hasOwn(row, 't_shirt_size'), false)
    }
    assert.equal(body.entries['employee-record-overrides'][schoolId(schoolEmployee)].notes, 'School-visible note')
    // School managers can read their own building's recognition board, but not
    // another building's. Writing recognition stays refused for them entirely
    // (see canWriteStateKey in permissions.test.mjs).
    assert.deepEqual(
      Object.keys(body.entries['all-star-recognition-v1'] || {}),
      ['school-star']
    )
    assert.equal(Object.hasOwn(body.entries['employee-record-overrides'][schoolId(schoolEmployee)], 't_shirt_size'), false)
    assert.equal(Object.hasOwn(body.entries, 'employee-manager-notes-v1'), false)
    assert.equal(Object.hasOwn(body.entries['employee-custom-records'][0], 't_shirt_size'), false)
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('T-shirt sizes are returned only to Liz full-admin access', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const employeeId = String(employees[0].kronos_id || employees[0].id)
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'employee-record-overrides': {
        [employeeId]: { notes: 'Administrative note', t_shirt_size: '2XL' },
      },
      'employee-manager-notes-v1': {
        [employeeId]: [{ text: 'Shared HR note', author: 'Liz', at: '2026-08-20T12:00:00.000Z' }],
      },
    })

    const lizRequest = await authenticatedRequest({
      role: 'admin',
      canEditAttendance: true,
      canManageRoster: true,
      canManageBlackouts: true,
    }, sessions)
    const lizResponse = await handleStateRequest(lizRequest, { stateStore: store, sessionStore: sessions })
    const lizBody = await lizResponse.json()

    assert.equal(lizResponse.status, 200)
    assert.equal(Object.hasOwn(lizBody.roster[0], 't_shirt_size'), true)
    assert.equal(lizBody.entries['employee-record-overrides'][employeeId].t_shirt_size, '2XL')

    const limitedRequest = await authenticatedRequest({
      role: 'admin',
      canEditAttendance: true,
      canManageRoster: true,
      canManageBlackouts: false,
    }, sessions)
    const limitedResponse = await handleStateRequest(limitedRequest, { stateStore: store, sessionStore: sessions })
    const limitedBody = await limitedResponse.json()

    assert.equal(limitedResponse.status, 200)
    assert.equal(Object.hasOwn(limitedBody.roster[0], 't_shirt_size'), false)
    assert.equal(limitedBody.roster[0].birthdate, employees[0].birthdate || '')
    assert.equal(limitedBody.entries['employee-record-overrides'][employeeId].notes, 'Administrative note')
    assert.equal(Object.hasOwn(limitedBody.entries['employee-record-overrides'][employeeId], 't_shirt_size'), false)
    assert.deepEqual(limitedBody.entries['employee-manager-notes-v1'][employeeId], [{ text: 'Shared HR note', author: 'Liz', at: '2026-08-20T12:00:00.000Z' }])

    const appendedNotes = [
      { text: 'Shared HR note', author: 'Liz', at: '2026-08-20T12:00:00.000Z' },
      { text: 'Added by restricted manager', author: 'Restricted Manager', at: '2026-08-21T09:00:00.000Z' },
    ]
    const limitedNoteRequest = await authenticatedRequest(
      {
        role: 'admin',
        displayName: 'Restricted Manager',
        canEditAttendance: true,
        canManageRoster: false,
        canManageBlackouts: false,
      },
      sessions,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
        body: JSON.stringify({
          action: 'mutate',
          key: 'employee-manager-notes-v1',
          mutation: {
            type: 'object-patch',
            set: { [employeeId]: appendedNotes },
            remove: [],
          },
        }),
      }
    )
    const limitedNoteResponse = await handleStateRequest(limitedNoteRequest, { stateStore: store, sessionStore: sessions })
    assert.equal(limitedNoteResponse.status, 200)
    // A restricted admin can append a new entry but the earlier one — added by
    // someone else — is still there, not overwritten.
    assert.deepEqual((await limitedNoteResponse.json()).value[employeeId], appendedNotes)

    const limitedWriteRequest = await authenticatedRequest(
      {
        role: 'admin',
        canEditAttendance: true,
        canManageRoster: true,
        canManageBlackouts: false,
      },
      sessions,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
        body: JSON.stringify({
          action: 'mutate',
          key: 'employee-record-overrides',
          mutation: {
            type: 'object-patch',
            set: { [employeeId]: { notes: 'Changed', t_shirt_size: 'XS' } },
            remove: [],
          },
        }),
      }
    )
    assert.equal((await handleStateRequest(limitedWriteRequest, { stateStore: store, sessionStore: sessions })).status, 403)
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('recognition pilots receive only recognition data and cannot alter attendance or district awards', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const employee = employees[0]
    const employeeId = String(employee.kronos_id || employee.id)
    const existing = {
      id: 'existing-star',
      employeeId,
      locationId: employee.location,
      type: 'star-of-day',
      date: '2026-08-25',
      monthKey: null,
      criteria: ['Service'],
      note: '',
      sourceName: '',
      recognizedBy: 'Existing Manager',
      createdAt: '2026-08-25T12:00:00.000Z',
    }
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'all-star-recognition-v1': { [existing.id]: existing },
      'employee-manager-notes-v1': { [employeeId]: 'Private HR note' },
      [`att-emp-${employeeId}-2026`]: {
        '2026-08-25': { date: '2026-08-25', code: 'UNEX', note: '' },
      },
    })
    const pilot = {
      role: 'admin',
      displayName: 'Pilot Manager 1',
      canEditAttendance: false,
      canEditRecognition: true,
      canManageRecognitionAwards: false,
      recognitionOnly: true,
      canManageRoster: false,
      canManageBlackouts: false,
    }

    const readRequest = await authenticatedRequest(pilot, sessions)
    const readResponse = await handleStateRequest(readRequest, { stateStore: store, sessionStore: sessions })
    const readBody = await readResponse.json()
    assert.equal(readResponse.status, 200)
    assert.deepEqual(Object.keys(readBody.entries), ['all-star-recognition-v1'])
    assert.equal(readBody.roster[0].birthdate, undefined)
    assert.equal(readBody.roster[0].hire_date, undefined)
    assert.equal(readBody.roster[0].t_shirt_size, undefined)

    const attendanceRequest = await authenticatedRequest(pilot, sessions, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
      body: JSON.stringify({
        action: 'mutate',
        key: `att-emp-${employeeId}-2026`,
        mutation: { type: 'object-patch', set: {}, remove: [] },
      }),
    })
    assert.equal((await handleStateRequest(attendanceRequest, { stateStore: store, sessionStore: sessions })).status, 403)

    const pilotStar = { ...existing, id: 'pilot-star', recognizedBy: 'Spoofed Actor' }
    const pilotStarRequest = await authenticatedRequest(pilot, sessions, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
      body: JSON.stringify({
        action: 'mutate',
        key: 'all-star-recognition-v1',
        mutation: { type: 'object-patch', set: { [pilotStar.id]: pilotStar }, remove: [] },
      }),
    })
    const pilotStarResponse = await handleStateRequest(pilotStarRequest, { stateStore: store, sessionStore: sessions })
    const pilotStarBody = await pilotStarResponse.json()
    assert.equal(pilotStarResponse.status, 200)
    assert.equal(pilotStarBody.value[pilotStar.id].recognizedBy, 'Pilot Manager 1')

    const districtAward = {
      ...existing,
      id: 'pilot-eom',
      type: 'warren-employee-month',
      criteria: ['Qualified through All-Star of the Month'],
    }
    const districtAwardRequest = await authenticatedRequest(pilot, sessions, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
      body: JSON.stringify({
        action: 'mutate',
        key: 'all-star-recognition-v1',
        mutation: { type: 'object-patch', set: { [districtAward.id]: districtAward }, remove: [] },
      }),
    })
    assert.equal((await handleStateRequest(districtAwardRequest, { stateStore: store, sessionStore: sessions })).status, 403)
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

// Liz, 2026-09-02: building managers record the daily star for their own team.
// The record is still attributed from the session, never from the client, so a
// spoofed recognizedBy is overwritten rather than trusted.
test('school managers record recognition for their own team', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const schoolEmployee = employees.find(employee => employee.location !== 'Admin')
    const employeeId = String(schoolEmployee.kronos_id || schoolEmployee.id)
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'all-star-recognition-v1': {},
    })
    const record = {
      id: 'own-team-star',
      employeeId,
      locationId: schoolEmployee.location,
      type: 'star-of-day',
      date: '2026-08-25',
      monthKey: null,
      criteria: ['Service'],
      note: 'Great lunch service',
      sourceName: '',
      recognizedBy: 'Spoofed Actor',
      createdAt: '2026-08-25T12:00:00.000Z',
    }
    const request = await authenticatedRequest({
      role: 'school',
      locationId: schoolEmployee.location,
      displayName: 'Test School Manager',
      canEditAttendance: true,
    }, sessions, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
      body: JSON.stringify({
        action: 'mutate',
        key: 'all-star-recognition-v1',
        mutation: { type: 'object-patch', set: { [record.id]: record }, remove: [] },
      }),
    })

    const response = await handleStateRequest(request, { stateStore: store, sessionStore: sessions })
    assert.equal(response.status, 200)

    const saved = (await store.get('all-star-recognition-v1'))[record.id]
    assert.ok(saved, 'the star should be recorded')
    assert.equal(saved.employeeId, employeeId)
    assert.equal(saved.recognizedBy, 'Test School Manager')
    assert.equal(saved.recognizedByLocationId, schoolEmployee.location)
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

// The building a manager signs in as is the authority, not the employee id the
// client sends: a star for someone else's kitchen is dropped, not stored.
test('school managers cannot record recognition for another building', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const ownEmployee = employees.find(employee => employee.location !== 'Admin')
    const otherEmployee = employees.find(employee => (
      employee.location !== 'Admin' && employee.location !== ownEmployee.location
    ))
    assert.ok(otherEmployee, 'the roster needs a second building for this test')

    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'all-star-recognition-v1': {},
    })
    const record = {
      id: 'other-building-star',
      employeeId: String(otherEmployee.kronos_id || otherEmployee.id),
      // The client even names the other building; the session still wins.
      locationId: otherEmployee.location,
      type: 'star-of-day',
      date: '2026-08-25',
      monthKey: null,
      criteria: ['Service'],
      note: 'Great lunch service',
      sourceName: '',
      recognizedBy: 'Spoofed Actor',
      createdAt: '2026-08-25T12:00:00.000Z',
    }
    const request = await authenticatedRequest({
      role: 'school',
      locationId: ownEmployee.location,
      displayName: 'Test School Manager',
      canEditAttendance: true,
    }, sessions, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
      body: JSON.stringify({
        action: 'mutate',
        key: 'all-star-recognition-v1',
        mutation: { type: 'object-patch', set: { [record.id]: record }, remove: [] },
      }),
    })

    const response = await handleStateRequest(request, { stateStore: store, sessionStore: sessions })
    // The row is dropped rather than the request refused: the board simply
    // never gains a star for a team this manager does not run.
    assert.equal(response.status, 200)
    assert.deepEqual(await store.get('all-star-recognition-v1'), {})
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('school managers cannot create district Employee of the Month records', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const schoolEmployee = employees.find(employee => employee.location !== 'Admin')
    const employeeId = String(schoolEmployee.kronos_id || schoolEmployee.id)
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'all-star-recognition-v1': {},
    })
    const record = {
      id: 'restricted-district-award',
      employeeId,
      locationId: schoolEmployee.location,
      type: 'warren-employee-month',
      date: '2026-08-25',
      monthKey: null,
      criteria: ['Qualified through All-Star of the Month'],
      note: '',
      sourceName: '',
      recognizedBy: 'School Manager',
      createdAt: '2026-08-25T12:00:00.000Z',
    }
    const request = await authenticatedRequest({
      role: 'school',
      locationId: schoolEmployee.location,
      displayName: 'Test School Manager',
      canEditAttendance: true,
    }, sessions, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
      body: JSON.stringify({
        action: 'mutate',
        key: 'all-star-recognition-v1',
        mutation: { type: 'object-patch', set: { [record.id]: record }, remove: [] },
      }),
    })

    const response = await handleStateRequest(request, { stateStore: store, sessionStore: sessions })
    assert.equal(response.status, 403)
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('Liz can download and restore a full backup while restricted administrators are blocked', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const employeeId = String(employees[0].kronos_id || employees[0].id)
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'attendance-blackout-dates': [{ date: '2026-09-07', label: 'Labor Day' }],
      'employee-manager-notes-v1': {
        [employeeId]: [{ text: 'Original note', author: 'Liz', at: '2026-08-20T12:00:00.000Z' }],
      },
      'all-star-recognition-v1': {},
    })
    const lizAccess = {
      role: 'admin',
      displayName: 'Liz',
      canEditAttendance: true,
      canManageRoster: true,
      canManageBlackouts: true,
    }

    const backupRequest = await authenticatedRequest(lizAccess, sessions, {
      url: 'https://example.test/api/state?action=backup',
    })
    const backupResponse = await handleStateRequest(backupRequest, { stateStore: store, sessionStore: sessions })
    const backup = await backupResponse.json()
    assert.equal(backupResponse.status, 200)
    assert.match(backupResponse.headers.get('content-disposition'), /warren-attendance-backup-/)
    assert.equal(backup.format, 'warren-attendance-backup')
    assert.equal(backup.version, 1)
    assert.deepEqual(
      backup.entries['employee-manager-notes-v1'][employeeId],
      [{ text: 'Original note', author: 'Liz', at: '2026-08-20T12:00:00.000Z' }]
    )

    const limitedRequest = await authenticatedRequest({
      role: 'admin',
      displayName: 'Restricted Manager',
      canEditAttendance: true,
      canManageRoster: false,
      canManageBlackouts: false,
    }, sessions, { url: 'https://example.test/api/state?action=backup' })
    assert.equal((await handleStateRequest(limitedRequest, { stateStore: store, sessionStore: sessions })).status, 403)

    await store.setJSON('employee-manager-notes-v1', {
      [employeeId]: [{ text: 'Changed after backup', author: 'Liz', at: '2026-08-27T12:00:00.000Z' }],
      temporary: [{ text: 'Remove during restore', author: 'Liz', at: '2026-08-27T12:05:00.000Z' }],
    })
    await store.setJSON(`att-emp-${employeeId}-2026`, {
      '2026-08-26': { date: '2026-08-26', code: 'UNEX', note: 'Created after backup' },
    })

    const restoreRequest = await authenticatedRequest(lizAccess, sessions, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
      body: JSON.stringify({ action: 'restore-backup', confirmation: 'RESTORE', backup }),
    })
    const restoreResponse = await handleStateRequest(restoreRequest, { stateStore: store, sessionStore: sessions })
    assert.equal(restoreResponse.status, 200)

    const verifyRequest = await authenticatedRequest(lizAccess, sessions)
    const verifyResponse = await handleStateRequest(verifyRequest, { stateStore: store, sessionStore: sessions })
    const verified = await verifyResponse.json()
    assert.deepEqual(verified.entries['employee-manager-notes-v1'], {
      [employeeId]: [{ text: 'Original note', author: 'Liz', at: '2026-08-20T12:00:00.000Z' }],
    })
    assert.deepEqual(verified.entries[`att-emp-${employeeId}-2026`], {})
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

// HR asked for the phone number and the hire date off the employee card on
// 2026-10-19. Taking them off the screen is not the same as not sending
// them, so this asserts the payload.
test('a building is sent neither a phone number nor a hire date', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  const schoolId = employee => String(employee.kronos_id || employee.id)
  const sessions = createMemoryBlobStore()
  const store = stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'employee-record-overrides': {
      [schoolId(employees[0])]: { phone: '3175550134', notes: 'kept' },
    },
  })
  const request = await authenticatedRequest({
    role: 'school',
    locationId: employees[0].location,
    canEditAttendance: true,
  }, sessions)
  const response = await handleStateRequest(request, { stateStore: store, sessionStore: sessions })
  const body = await response.json()

  assert.ok(body.roster.every(row => !Object.hasOwn(row, 'hire_date')))
  const overrides = body.entries['employee-record-overrides'] || {}
  for (const record of Object.values(overrides)) {
    assert.equal(Object.hasOwn(record, 'phone'), false, 'a stored phone number is not sent on')
  }
  assert.equal(overrides[schoolId(employees[0])]?.notes, 'kept', 'the rest of the record survives')

  if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
  else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
})

// Liz, 2026-10-20: hire dates in the district's own files turned out to be
// out of date, so the work-anniversary feature was congratulating people on
// the wrong day. The feature went, and the field with it.
//
// This asserts the strong version — that NOBODY is sent a hire date, rather
// than that buildings are withheld one. It used to be sent to Liz's tier, so
// a test checking only a school session would still have passed.
test('no session of any tier is sent a hire date', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    for (const access of [
      { role: 'admin', canEditAttendance: true, canManageRoster: true, canManageBlackouts: true },
      { role: 'admin', canEditAttendance: true, canManageRoster: false, canManageBlackouts: false },
      { role: 'school', locationId: 'CrestonMS', canEditAttendance: true },
    ]) {
      const sessions = createMemoryBlobStore()
      const store = stateStore({ __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' } })
      const request = await authenticatedRequest(access, sessions)
      const response = await handleStateRequest(request, { stateStore: store, sessionStore: sessions })
      const body = await response.json()
      assert.ok(body.roster.length > 0, 'the roster should not be empty')
      assert.ok(
        body.roster.every(row => !Object.hasOwn(row, 'hire_date')),
        `a ${access.role} session was sent a hire date`
      )
    }
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

// Liz, 2026-10-26: a district-wide login that runs the All-Stars programme
// across every school and sees none of the district's attendance.
//
// These assert the half that cannot be done in the browser. Hiding a page
// hides nothing if the endpoint has already handed the records over.
test('a login that cannot see attendance is not sent any', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const store = stateStore({
      'att-emp-123-2026': { '2026-09-01': { code: 'NCNS' } },
      'hr-attendance-progress-v2': { '123': { empId: '123', stage: 'documented' } },
      'employee-manager-notes-v1': { '123': [{ text: 'A note', at: '2026-09-02' }] },
      'training-records-v1': [{ id: 't1', hours: 2 }],
      'attendance-blackout-dates': ['2026-12-25'],
      'all-star-recognition-v1': { r1: { id: 'r1', employeeId: '123', type: 'star-of-day', date: '2026-09-03' } },
    })

    const access = {
      role: 'admin',
      canManageRoster: true,
      canManageBlackouts: true,
      canEditRecognition: true,
      canViewAttendance: false,
    }
    const request = await authenticatedRequest(access, sessions)
    const body = await (await handleStateRequest(request, { stateStore: store, sessionStore: sessions })).json()
    const keys = Object.keys(body.entries)

    assert.ok(!keys.some(key => key.startsWith('att-emp-')), 'no attendance years')
    assert.ok(!keys.includes('hr-attendance-progress-v2'), 'no occurrence counts')
    assert.ok(!keys.includes('employee-manager-notes-v1'), 'no manager notes')
    // What they came for is untouched, for the whole district.
    assert.ok(keys.includes('all-star-recognition-v1'), 'recognition still arrives')
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('training and blackout dates are withheld independently', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const entries = {
      'training-records-v1': [{ id: 't1', hours: 2 }],
      'attendance-blackout-dates': ['2026-12-25'],
      'att-emp-123-2026': { '2026-09-01': { code: 'NCNS' } },
    }
    const base = { role: 'admin', canEditAttendance: true, canManageRoster: true, canManageBlackouts: true }

    const read = async access => {
      const sessions = createMemoryBlobStore()
      const request = await authenticatedRequest(access, sessions)
      const response = await handleStateRequest(request, { stateStore: stateStore({ ...entries }), sessionStore: sessions })
      return Object.keys((await response.json()).entries)
    }

    const noTraining = await read({ ...base, canViewTraining: false })
    assert.ok(!noTraining.includes('training-records-v1'))
    assert.ok(noTraining.includes('attendance-blackout-dates'), 'blackouts are a separate switch')
    assert.ok(noTraining.some(key => key.startsWith('att-emp-')), 'attendance is a separate switch')

    const noBlackouts = await read({ ...base, canViewBlackouts: false })
    assert.ok(!noBlackouts.includes('attendance-blackout-dates'))
    assert.ok(noBlackouts.includes('training-records-v1'))
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})
