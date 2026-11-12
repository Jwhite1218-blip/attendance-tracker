import test from 'node:test'
import assert from 'node:assert/strict'
import employees from '../../../src/data/employees.json' with { type: 'json' }
import { createSessionToken, sessionFromRequest } from './auth.mjs'
import { registerServerSession } from './server-session.mjs'
import { createMemoryBlobStore } from './test-blob-store.mjs'
import { handleBackupRestore, handleMutate, handleStateRequest, schoolRecognitionView, schoolStarCardPrintView, starCardPrintMutationForSession } from '../state.mjs'
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

// Liz, 2026-10-26: "a change request I had submitted from another login
// wasn't showing up on my login." This walks the whole path — a limited
// administrator writes one, Liz reads it back — because every link in it
// checked out on its own.
test('a request written by one administrator reaches another', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const KEY = 'pending-approvals-v1'
    const store = stateStore({ __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' } })

    const limitedAdmin = { role: 'admin', canManageRoster: false, canManageBlackouts: false, canEditAttendance: true }
    const request = {
      id: 'req-1', type: 'transfer', empId: '123', employeeName: 'Dana Example',
      status: 'pending', requestedBy: 'District Assistant', requestedAt: '2026-10-26T12:00:00.000Z',
      payload: { to: 'CrestonMS' }, baseline: { location: 'StonyBrkMS' },
    }

    const written = await handleMutate(store, limitedAdmin, {
      key: KEY,
      mutation: { type: 'keyed-array-patch', upsert: [{ identity: 'req-1', value: request }], remove: [] },
    })
    assert.equal(written.status, 200, 'a limited administrator may submit one')
    assert.deepEqual(await store.get(KEY), [request], 'and it is stored')

    const sessions = createMemoryBlobStore()
    const liz = { role: 'admin', canManageRoster: true, canManageBlackouts: true, canEditAttendance: true }
    const read = await handleStateRequest(
      await authenticatedRequest(liz, sessions),
      { stateStore: store, sessionStore: sessions }
    )
    const body = await read.json()
    assert.deepEqual(body.entries[KEY], [request], 'and Liz is sent it')
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

// Liz, 2026-10-26: "I have a few managers that oversee multiple locations —
// could they have manager access but to all locations?"
test('a manager covering two kitchens is sent both rosters and neither more', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const store = stateStore({ __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' } })
    const covers = { role: 'school', locationId: 'CrestonMS', locationIds: ['CrestonMS', 'StonyBrkMS'], canEditAttendance: true }

    const request = await authenticatedRequest(covers, sessions)
    const body = await (await handleStateRequest(request, { stateStore: store, sessionStore: sessions })).json()
    const places = new Set(body.roster.map(row => row.location))

    assert.ok(places.has('CrestonMS'), 'their first kitchen')
    assert.ok(places.has('StonyBrkMS'), 'and their second')

    // A school session has always also received manager-grade staff from
    // every building, for peer Shout-Outs. What must NOT appear is ordinary
    // staff from a kitchen this login does not cover.
    const outsiders = body.roster.filter(row =>
      !['CrestonMS', 'StonyBrkMS'].includes(row.location)
      && !MANAGER_GRADE_POSITIONS.includes(row.position))
    assert.deepEqual(outsiders, [], 'no ordinary staff from a kitchen they do not cover')
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('a single-building login is unchanged by the list', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const store = stateStore({ __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' } })
    const request = await authenticatedRequest({ role: 'school', locationId: 'CrestonMS', canEditAttendance: true }, sessions)
    const body = await (await handleStateRequest(request, { stateStore: store, sessionStore: sessions })).json()
    const outsiders = body.roster.filter(row =>
      row.location !== 'CrestonMS' && !MANAGER_GRADE_POSITIONS.includes(row.position))
    assert.deepEqual(outsiders, [], 'exactly as before the list existed')
    assert.ok(body.roster.some(row => row.location === 'CrestonMS'))
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

// Liz, 2026-10-26: "make the Warren Star Shout Outs visible across all feeds
// since they are able to do peer to peer recognitions."
//
// This widens what a building login may READ, which is the kind of change
// worth pinning precisely: one award type crosses the boundary and the
// other five do not.
test('only shout-outs cross the building boundary, and they arrive with a name', () => {
  const allowed = new Set(['mine'])
  const names = new Map([['theirs', 'Dana Reyes']])
  const board = {
    'own-star': { id: 'own-star', employeeId: 'mine', type: 'star-of-day' },
    'their-star': { id: 'their-star', employeeId: 'theirs', type: 'star-of-day' },
    'their-nomination': { id: 'their-nomination', employeeId: 'theirs', type: 'shooting-star' },
    'their-buck': { id: 'their-buck', employeeId: 'theirs', type: 'ace-buck' },
    'their-drawing': { id: 'their-drawing', employeeId: 'theirs', type: 'all-star-of-month' },
    'their-eom': { id: 'their-eom', employeeId: 'theirs', type: 'warren-employee-month' },
    'their-shout': { id: 'their-shout', employeeId: 'theirs', type: 'star-shout-out' },
    'own-shout': { id: 'own-shout', employeeId: 'mine', type: 'star-shout-out' },
  }

  const visible = schoolRecognitionView(board, allowed, names)
  assert.deepEqual(Object.keys(visible).sort(), ['own-shout', 'own-star', 'their-shout'])
  assert.equal(visible['their-shout'].recipientName, 'Dana Reyes')
  // Their own people are already nameable from the roster, so nothing is
  // bolted onto those records.
  assert.equal(Object.hasOwn(visible['own-star'], 'recipientName'), false)
  assert.equal(Object.hasOwn(visible['own-shout'], 'recipientName'), false)
})

test('a shout-out for somebody with no name on file still travels', () => {
  const visible = schoolRecognitionView(
    { ghost: { id: 'ghost', employeeId: 'gone', type: 'star-shout-out' } },
    new Set(),
    new Map(),
  )
  assert.deepEqual(Object.keys(visible), ['ghost'])
  assert.equal(Object.hasOwn(visible.ghost, 'recipientName'), false)
})

test("a building reads another building's shout-out but still not its stars", async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const mine = employees.find(employee => employee.location !== 'Admin')
    const theirs = employees.find(employee => employee.location !== mine.location && employee.location !== 'Admin')
    const id = employee => String(employee.kronos_id || employee.id)
    const base = {
      monthKey: null, criteria: [], note: '', sourceName: '', recognizedBy: 'Someone',
      createdAt: '2026-09-01T12:00:00.000Z', date: '2026-09-01',
    }
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'all-star-recognition-v1': {
        'their-shout': { ...base, id: 'their-shout', employeeId: id(theirs), locationId: theirs.location, type: 'star-shout-out' },
        'their-star': { ...base, id: 'their-star', employeeId: id(theirs), locationId: theirs.location, type: 'star-of-day' },
      },
    })

    const request = await authenticatedRequest(
      { role: 'school', locationId: mine.location, canEditAttendance: true },
      sessions,
    )
    const body = await (await handleStateRequest(request, { stateStore: store, sessionStore: sessions })).json()
    const board = body.entries['all-star-recognition-v1']

    assert.deepEqual(Object.keys(board), ['their-shout'])
    assert.equal(board['their-shout'].recipientName, `${theirs.first_name} ${theirs.last_name}`.trim())
    // The name travels and nothing else does: no roster row, so no card,
    // no school picker entry and no attendance.
    assert.equal(body.roster.some(row => id(row) === id(theirs) && row.location === theirs.location
      && !MANAGER_GRADE_POSITIONS.includes(String(row.position || '').trim())), false)
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

// Found while widening the read above: the GET was filtered and the write
// reply was not, so a manager recording one star was handed every
// recognition in the district.
test('recording a star does not hand a building the whole district board', async () => {
  const mine = employees.find(employee => employee.location !== 'Admin')
  const theirs = employees.find(employee => employee.location !== mine.location && employee.location !== 'Admin')
  const id = employee => String(employee.kronos_id || employee.id)
  const base = {
    monthKey: null, criteria: [], note: '', sourceName: '', recognizedBy: 'Someone',
    createdAt: '2026-09-01T12:00:00.000Z', date: '2026-09-01',
  }
  const store = stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'all-star-recognition-v1': {
      'their-star': { ...base, id: 'their-star', employeeId: id(theirs), locationId: theirs.location, type: 'star-of-day' },
      'their-shout': { ...base, id: 'their-shout', employeeId: id(theirs), locationId: theirs.location, type: 'star-shout-out' },
    },
  })

  const response = await handleMutate(
    store,
    { role: 'school', locationId: mine.location, canEditAttendance: true, canEditRecognition: true },
    {
      key: 'all-star-recognition-v1',
      mutation: {
        type: 'object-patch',
        set: {
          'my-star': {
            ...base, id: 'my-star', employeeId: id(mine), locationId: mine.location,
            type: 'star-of-day', date: '2026-09-02',
          },
        },
      },
    },
  )

  assert.equal(response.status, 200)
  const { value } = await response.json()
  assert.deepEqual(Object.keys(value).sort(), ['my-star', 'their-shout'])
  // Stored in full; it is only the reply to this login that is narrowed.
  assert.deepEqual(Object.keys(await store.get('all-star-recognition-v1')).sort(),
    ['my-star', 'their-shout', 'their-star'])
})

// Liz, 2026-10-27, with a screenshot: her District Admin page listed ten
// people and a kitchen manager's Shout-Out list offered three of them.
//
// The three were the ones that ship in employees.json. The other seven had
// been added through the app, and a custom employee record was only ever
// sent to the building that employee worked in — so whether a district
// office colleague could be thanked depended on how they had got into the
// system, which is not a distinction anybody could have guessed from the
// screen.
test('a district office colleague added in the app reaches every building', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const mine = employees.find(employee => employee.location !== 'Admin')
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'employee-custom-records': [
        // Not food service, and not in any kitchen — exactly the case.
        { id: 900001, kronos_id: 'van-1', first_name: 'Van', last_name: 'Parham',
          position: 'Marketing Manager', location: 'Admin', active: true, t_shirt_size: 'L' },
        // Somebody else's building. Must stay invisible.
        { id: 900002, kronos_id: 'other-1', first_name: 'Someone', last_name: 'Else',
          position: 'Cook', location: 'StonyBrkMS', active: true },
      ],
    })

    const request = await authenticatedRequest(
      { role: 'school', locationId: mine.location, canEditAttendance: true },
      sessions,
    )
    const body = await (await handleStateRequest(request, { stateStore: store, sessionStore: sessions })).json()
    const custom = body.entries['employee-custom-records'] || []
    const names = custom.map(row => `${row.first_name} ${row.last_name}`)

    assert.deepEqual(names, ['Van Parham'], 'the office colleague travels; another kitchen does not')
    // Widened who a building can name, not what it may see about them.
    assert.equal(Object.hasOwn(custom[0], 't_shirt_size'), false)
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

// Liz, 2026-10-27: "so can you confirm that employee cards added by roster
// import and added in app will be treated the same across all rules?"
//
// They did not leave the server the same way. A roster-file employee went
// out through an allowlist naming the fields that may travel; one added in
// the app went out through a denylist removing two. The results agreed only
// because the Add Employee form cannot collect a field the allowlist would
// have dropped — which is a coincidence that the next new field would end.
test('an employee added in the app leaves through the same allowlist as one from the file', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const mine = employees.find(employee => employee.location !== 'Admin')
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'employee-custom-records': [{
        id: 900003,
        kronos_id: 'added-1',
        first_name: 'Added',
        last_name: 'Person',
        position: 'Cook',
        location: mine.location,
        active: true,
        birthdate: '03-14',
        service_date: '2024-08-01',
        // None of these can be entered today. They stand in for whatever
        // field somebody adds to an employee card next.
        pay_amount: 21.5,
        weekly_hours: 32,
        phone: '555-0101',
        t_shirt_size: 'L',
        ssn_last_four: '1234',
      }],
    })

    const request = await authenticatedRequest(
      { role: 'school', locationId: mine.location, canEditAttendance: true },
      sessions,
    )
    const body = await (await handleStateRequest(request, { stateStore: store, sessionStore: sessions })).json()
    const [added] = body.entries['employee-custom-records']

    assert.deepEqual(
      Object.keys(added).sort(),
      ['birthdate', 'first_name', 'id', 'kronos_id', 'last_name', 'location', 'position', 'service_date'],
      'exactly the fields a roster-file employee is allowed, and nothing else'
    )

    // The same shape a building receives for somebody from the file, so no
    // screen can tell the two apart and no future field sneaks past.
    const fromFile = body.roster.find(row => String(row.kronos_id || row.id) === String(mine.kronos_id || mine.id))
    assert.deepEqual(Object.keys(added).sort(), Object.keys(fromFile).sort())
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

// Jon, 2026-10-30: Liz can redraw a building's monthly winner. The person
// drawn is set aside, and who that was rides on the new winner's record —
// for the district administrators who run the drawing, and nobody else.
function redrawnWinner(employee, setAsideId = 'drawn-first') {
  return {
    id: 'redrawn-winner',
    employeeId: String(employee.kronos_id || employee.id),
    locationId: employee.location,
    type: 'all-star-of-month',
    date: '2026-09-30',
    monthKey: '2026-09',
    criteria: [],
    note: 'Selected from 4 building entries; 1 belonged to this employee.',
    sourceName: '',
    recognizedBy: 'District Admin',
    createdAt: '2026-10-01T15:00:00.000Z',
    redraw: {
      setAside: [{
        employeeId: setAsideId,
        drawnAt: '2026-10-01T14:00:00.000Z',
        setAsideAt: '2026-10-01T15:00:00.000Z',
        setAsideBy: 'District Admin',
      }],
    },
  }
}

const drawingAdmin = {
  role: 'admin',
  displayName: 'District Admin',
  canEditAttendance: true,
  canEditRecognition: true,
  canManageRecognitionAwards: true,
}

test('a building sees its redrawn winner but not who was set aside', () => {
  const employee = employees.find(row => row.location !== 'Admin')
  const winner = redrawnWinner(employee)
  const visible = schoolRecognitionView({ [winner.id]: winner }, new Set([winner.employeeId]))
  assert.equal(visible[winner.id].employeeId, winner.employeeId)
  assert.equal(Object.hasOwn(visible[winner.id], 'redraw'), false)
})

test('a redraw history reaches the administrators who run the drawing and nobody else', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const sessions = createMemoryBlobStore()
    const employee = employees.find(row => row.location !== 'Admin')
    const winner = redrawnWinner(employee)
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'all-star-recognition-v1': { [winner.id]: winner },
    })
    const read = async access => {
      const request = await authenticatedRequest(access, sessions)
      const body = await (await handleStateRequest(request, { stateStore: store, sessionStore: sessions })).json()
      return body.entries['all-star-recognition-v1']?.[winner.id]
    }

    assert.deepEqual((await read(drawingAdmin)).redraw, winner.redraw)

    const others = {
      building: { role: 'school', locationId: employee.location, canEditAttendance: true },
      pilot: { role: 'admin', displayName: 'Pilot', canEditAttendance: false, canEditRecognition: true, recognitionOnly: true },
      reviewer: { role: 'admin', displayName: 'Reviewer', canEditAttendance: false, canEditRecognition: false },
    }
    for (const [who, access] of Object.entries(others)) {
      const seen = await read(access)
      assert.equal(seen?.employeeId, winner.employeeId, `${who} still sees the winner`)
      assert.equal(Object.hasOwn(seen, 'redraw'), false, `${who} is not told about the redraw`)
    }
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

test('an administrator redraw replaces the winner in one change and keeps who was set aside', async () => {
  const employee = employees.find(row => row.location !== 'Admin')
  const winner = redrawnWinner(employee)
  const { redraw: _redraw, ...firstDraw } = { ...winner, id: 'first-draw', employeeId: 'drawn-first' }
  const store = stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'all-star-recognition-v1': { [firstDraw.id]: firstDraw },
  })

  const response = await handleMutate(store, drawingAdmin, {
    key: 'all-star-recognition-v1',
    mutation: { type: 'object-patch', set: { [winner.id]: winner }, remove: [firstDraw.id] },
  })

  assert.equal(response.status, 200)
  const stored = await store.get('all-star-recognition-v1')
  assert.deepEqual(Object.keys(stored), [winner.id])
  assert.deepEqual(stored[winner.id].redraw, winner.redraw)
  const { value } = await response.json()
  assert.deepEqual(value[winner.id].redraw, winner.redraw)
})

test('a login that cannot see a redraw history cannot write one either', async () => {
  const employee = employees.find(row => row.location !== 'Admin')
  const winner = redrawnWinner(employee)
  const store = stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'all-star-recognition-v1': {},
  })
  const pilot = { role: 'admin', displayName: 'Pilot', canEditRecognition: true, recognitionOnly: true, canManageRecognitionAwards: false }

  const response = await handleMutate(store, pilot, {
    key: 'all-star-recognition-v1',
    mutation: { type: 'object-patch', set: { [winner.id]: winner }, remove: [] },
  })

  assert.equal(response.status, 200)
  assert.equal(Object.hasOwn((await store.get('all-star-recognition-v1'))[winner.id], 'redraw'), false)
  assert.equal(Object.hasOwn((await response.json()).value[winner.id], 'redraw'), false)
})

test('a redraw history must be well formed, and only a drawing may carry one', async () => {
  const employee = employees.find(row => row.location !== 'Admin')
  const winner = redrawnWinner(employee)
  const attempt = async record => {
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'all-star-recognition-v1': {},
    })
    return (await handleMutate(store, drawingAdmin, {
      key: 'all-star-recognition-v1',
      mutation: { type: 'object-patch', set: { [record.id]: record }, remove: [] },
    })).status
  }

  assert.equal(await attempt(winner), 200)
  assert.equal(await attempt({ ...winner, redraw: { setAside: [] } }), 400)
  assert.equal(await attempt({ ...winner, redraw: { setAside: [{ employeeId: '', setAsideAt: winner.createdAt, setAsideBy: 'X' }] } }), 400)
  assert.equal(await attempt({ ...winner, redraw: { setAside: [{ employeeId: 'a', setAsideAt: 'not a time', setAsideBy: 'X' }] } }), 400)
  assert.equal(await attempt({
    ...winner,
    redraw: { setAside: Array.from({ length: 51 }, (_, index) => ({ employeeId: `p${index}`, setAsideAt: winner.createdAt, setAsideBy: 'X' })) },
  }), 400)
  assert.equal(await attempt({
    ...winner,
    type: 'star-of-day',
    monthKey: null,
    criteria: ['Service'],
    note: 'Covered the line',
  }), 400)
})

// Jon, 2026-10-30: Liz put a winner in the wrong month. A corrected record
// says who corrected it and when, and the server checks both.
test('a corrected winner may say who changed it, and it must say so properly', async () => {
  const employee = employees.find(row => row.location !== 'Admin')
  const { redraw: _redraw, ...winner } = redrawnWinner(employee)
  const attempt = async record => {
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
      'all-star-recognition-v1': {},
    })
    return (await handleMutate(store, drawingAdmin, {
      key: 'all-star-recognition-v1',
      mutation: { type: 'object-patch', set: { [record.id]: record }, remove: [] },
    })).status
  }

  assert.equal(await attempt({ ...winner, updatedAt: '2026-10-30T17:00:00.000Z', updatedBy: 'District Admin' }), 200)
  assert.equal(await attempt({ ...winner, updatedAt: 'yesterday', updatedBy: 'District Admin' }), 400)
  assert.equal(await attempt({ ...winner, updatedAt: '2026-10-30T17:00:00.000Z', updatedBy: 'x'.repeat(201) }), 400)
})

// Jon, 2026-10-30: Liz gives several Coach Bucks at once. They arrive as one
// change, and the server still judges each leader on their own: a cook
// ticked in by mistake is dropped without taking the others with them.
test('several Coach Bucks in one change land for every kitchen manager in it', async () => {
  const id = employee => String(employee.kronos_id || employee.id)
  const managers = employees
    .filter(employee => employee.location !== 'Admin'
      && MANAGER_GRADE_POSITIONS.includes(String(employee.position || '').trim()))
    .slice(0, 2)
  const cook = employees.find(employee => employee.location !== 'Admin'
    && !MANAGER_GRADE_POSITIONS.includes(String(employee.position || '').trim()))
  assert.equal(managers.length, 2)

  const buck = (employee, recordId) => ({
    id: recordId,
    employeeId: id(employee),
    locationId: employee.location,
    type: 'ace-buck',
    date: '2026-10-30',
    monthKey: null,
    criteria: ['Safety Leader'],
    note: '',
    sourceName: '',
    recognizedBy: 'District Admin',
    createdAt: '2026-10-30T17:00:00.000Z',
    groupId: 'group-1',
  })
  const store = stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'all-star-recognition-v1': {},
  })

  const response = await handleMutate(store, drawingAdmin, {
    key: 'all-star-recognition-v1',
    mutation: {
      type: 'object-patch',
      set: {
        'buck-1': buck(managers[0], 'buck-1'),
        'buck-2': buck(managers[1], 'buck-2'),
        'buck-cook': buck(cook, 'buck-cook'),
      },
      remove: [],
    },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(Object.keys(await store.get('all-star-recognition-v1')).sort(), ['buck-1', 'buck-2'])
})

// Jon, 2026-10-30: one Warren Food Services Employee of the Month for the
// whole district, each month — held by the server as well as the page.
function employeeOfMonthAward(employee, overrides = {}) {
  return {
    id: 'eom-october',
    employeeId: String(employee.kronos_id || employee.id),
    locationId: employee.location,
    type: 'warren-employee-month',
    date: '2026-10-15',
    monthKey: null,
    criteria: ['Qualified through All-Star of the Month'],
    note: '',
    sourceName: '',
    recognizedBy: 'District Admin',
    createdAt: '2026-10-15T15:00:00.000Z',
    ...overrides,
  }
}

test('the server holds one Employee of the Month for the whole district each month', async () => {
  const [first, second] = employees.filter(row => row.location !== 'Admin')
    .filter((row, index, rows) => rows.findIndex(other => other.location === row.location) === index)
  const existing = employeeOfMonthAward(first)
  const write = async (store, set, remove = []) => handleMutate(store, drawingAdmin, {
    key: 'all-star-recognition-v1',
    mutation: { type: 'object-patch', set, remove },
  })
  const freshStore = () => stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'all-star-recognition-v1': { [existing.id]: existing },
  })

  // Somebody from another building in the same month is still a second one.
  const another = employeeOfMonthAward(second, { id: 'eom-second', date: '2026-10-28' })
  const refused = await write(freshStore(), { [another.id]: another })
  assert.equal(refused.status, 409)
  assert.match((await refused.json()).error, /October 2026 already has/)

  // Another month is fine, and so is correcting the one already there.
  assert.equal((await write(freshStore(), { [another.id]: { ...another, date: '2026-09-28' } })).status, 200)
  assert.equal((await write(freshStore(), { [existing.id]: { ...existing, note: 'Corrected.' } })).status, 200)

  // Swapping one for another in a single change is fine too.
  const store = freshStore()
  assert.equal((await write(store, { [another.id]: another }, [existing.id])).status, 200)
  assert.deepEqual(Object.keys(await store.get('all-star-recognition-v1')), [another.id])
})

test('only a district administrator can remove an Employee of the Month', async () => {
  const employee = employees.find(row => row.location !== 'Admin')
  const award = employeeOfMonthAward(employee)
  const store = stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'all-star-recognition-v1': { [award.id]: award },
  })
  const removal = { key: 'all-star-recognition-v1', mutation: { type: 'object-patch', set: {}, remove: [award.id] } }

  const building = { role: 'school', locationId: employee.location, canEditAttendance: true, canEditRecognition: true }
  assert.equal((await handleMutate(store, building, removal)).status, 403)
  assert.deepEqual(Object.keys(await store.get('all-star-recognition-v1')), [award.id])

  assert.equal((await handleMutate(store, drawingAdmin, removal)).status, 200)
  assert.deepEqual(Object.keys(await store.get('all-star-recognition-v1')), [])
})

// Jon, 2026-10-30: the payroll number came out of the records that evening,
// and stays out. Synthetic people and numbers throughout; none is anybody's.
const REKEYED_ROSTER = [
  { id: 1, kronos_id: 'emp-aaaa1111', first_name: 'Ana', last_name: 'One', location: 'CrestonMS', position: 'Cook' },
  { id: 2, kronos_id: 'emp-bbbb2222', first_name: 'Ben', last_name: 'Two', location: 'CrestonMS', position: 'Cook' },
]
const LIZ_SESSION = {
  role: 'admin',
  displayName: 'Liz',
  canEditAttendance: true,
  canEditRecognition: true,
  canManageRoster: true,
  canManageBlackouts: true,
}

function rekeyStore(entries) {
  const values = new Map(Object.entries(structuredClone(entries)))
  const deleted = []
  return {
    deleted,
    values,
    async list() { return { blobs: [...values.keys()].map(key => ({ key })) } },
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null },
    async setJSON(key, value) { values.set(key, structuredClone(value)) },
    async delete(key) { deleted.push(key); values.delete(key) },
    async reload() {},
    async updateJSON(key, mutation) {
      const { applyStateMutation } = await import('../../../src/data/stateMutations.js')
      const value = applyStateMutation(key, values.get(key) ?? null, mutation)
      values.set(key, value)
      return structuredClone(value)
    },
  }
}

test('once the roster is re-keyed, an old number cannot be written or restored back', async () => {
  const store = rekeyStore({ __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' } })
  const mark = { type: 'object-patch', set: { '2026-10-30': { date: '2026-10-30', code: 'UNEX', note: '' } }, remove: [] }

  const stale = await handleMutate(store, LIZ_SESSION, { key: 'att-emp-30000001-2026', mutation: mark }, { roster: REKEYED_ROSTER })
  assert.equal(stale.status, 409)
  assert.equal(store.values.has('att-emp-30000001-2026'), false)

  const fresh = await handleMutate(store, LIZ_SESSION, { key: 'att-emp-emp-aaaa1111-2026', mutation: mark }, { roster: REKEYED_ROSTER })
  assert.equal(fresh.status, 200)

  const oldBackup = {
    format: 'warren-attendance-backup',
    version: 1,
    exportedAt: '2026-10-29T00:00:00.000Z',
    exportedBy: 'Liz',
    entries: { 'att-emp-30000001-2026': { '2026-09-01': { date: '2026-09-01', code: 'UNEX', note: '' } } },
  }
  const restore = await handleBackupRestore(store, LIZ_SESSION, { confirmation: 'RESTORE', backup: oldBackup }, { roster: REKEYED_ROSTER })
  assert.equal(restore.status, 400)
  assert.match((await restore.json()).error, /before employee numbers were removed/)
})

// A printed star card is shared kitchen state. The kitchen that owns the
// star can file the mark; a star from another building, a nomination, and an
// attempt to un-print are not stored. The reply and a later read both hide
// the other building's marks.
test('a kitchen marks its own star card printed and cannot clear another kitchen', async () => {
  const kitchens = employees.filter(employee => employee.location !== 'Admin')
  const building = kitchens[0].location
  const mine = kitchens.filter(employee => employee.location === building)
  const other = kitchens.find(employee => employee.location !== building)
  assert.ok(mine.length >= 2 && other, 'the roster needs two people in one kitchen and a second kitchen')
  const idOf = employee => String(employee.kronos_id || employee.id)
  const star = (id, employee, extra = {}) => ({
    id,
    employeeId: idOf(employee),
    locationId: employee.location,
    type: 'star-of-day',
    ...extra,
  })
  const ownStar = star('own-star', mine[0])
  const groupA = star('group-a', mine[0], { groupId: 'lunch' })
  const groupB = star('group-b', mine[1], { groupId: 'lunch' })
  const otherStar = star('other-star', other)
  const shout = { ...star('shout', mine[0]), type: 'shooting-star' }
  const printedAt = '2026-11-11T18:00:00.000Z'
  const mark = recognitionIds => ({ printedAt, recognitionIds })
  const store = stateStore({
    'all-star-recognition-v1': {
      'own-star': ownStar,
      'group-a': groupA,
      'group-b': groupB,
      'other-star': otherStar,
      shout,
    },
    'star-card-prints-v1': {
      'other-star': { ...mark(['other-star']), printedBy: 'Other kitchen' },
    },
  })
  const access = {
    role: 'school',
    locationId: building,
    displayName: 'Kitchen Lead',
    canEditRecognition: true,
  }

  const response = await handleMutate(store, access, {
    key: 'star-card-prints-v1',
    mutation: {
      type: 'object-patch',
      set: {
        'own-star': mark(['own-star']),
        'group:lunch': mark(['group-a', 'group-b']),
        'other-star': mark(['other-star']),
        shout: mark(['shout']),
        'not-a-star': { printedAt: 'yesterday', recognitionIds: ['own-star'] },
      },
      remove: ['other-star'],
    },
  })
  assert.equal(response.status, 200)
  const saved = await store.get('star-card-prints-v1')
  assert.equal(saved['own-star'].printedBy, 'Kitchen Lead')
  assert.deepEqual(saved['group:lunch'].recognitionIds, ['group-a', 'group-b'])
  assert.equal(saved['other-star'].printedBy, 'Other kitchen', 'another kitchen stays printed')
  assert.equal(saved.shout, undefined)
  assert.equal(saved['not-a-star'], undefined)

  const body = await response.json()
  assert.equal(body.value['own-star'].printedBy, 'Kitchen Lead')
  assert.equal(body.value['other-star'], undefined, 'the write reply does not include the other kitchen')

  const replaced = await handleMutate(store, access, {
    key: 'star-card-prints-v1',
    mutation: { type: 'replace', value: {} },
  })
  assert.equal(replaced.status, 400)
  assert.ok((await store.get('star-card-prints-v1'))['own-star'])
})

test('printed cards include a shout-out, and not a coach buck or a nomination', () => {
  const printedAt = '2026-11-11T18:00:00.000Z'
  const mark = ids => ({ printedAt, recognitionIds: ids })
  const next = starCardPrintMutationForSession({
    type: 'object-patch',
    set: {
      buck: mark(['buck']),
      shout: mark(['shout']),
      nom: mark(['nom']),
    },
    remove: [],
  }, { role: 'admin', displayName: 'District' }, {
    buck: { id: 'buck', employeeId: 'emp-lead', locationId: 'HawthorneE', type: 'ace-buck' },
    shout: { id: 'shout', employeeId: 'emp-cook', locationId: 'HawthorneE', type: 'star-shout-out' },
    nom: { id: 'nom', employeeId: 'emp-cook', locationId: 'HawthorneE', type: 'shooting-star' },
  }, new Set())
  assert.equal(next.set.buck, undefined)
  assert.ok(next.set.shout)
  assert.equal(next.set.nom, undefined)
})

test('a kitchen read shows printed cards for its own stars only', async () => {
  const previousSecret = process.env.ATTENDANCE_SESSION_SECRET
  process.env.ATTENDANCE_SESSION_SECRET = 'test-session-secret-that-is-long-enough'
  try {
    const kitchens = employees.filter(employee => employee.location !== 'Admin')
    const building = kitchens[0].location
    const mine = kitchens.find(employee => employee.location === building)
    const other = kitchens.find(employee => employee.location !== building)
    const idOf = employee => String(employee.kronos_id || employee.id)
    const star = (key, employee) => ({
      id: key,
      employeeId: idOf(employee),
      locationId: employee.location,
      type: 'star-of-day',
    })
    const sessions = createMemoryBlobStore()
    const store = stateStore({
      __state_meta__: { initializedAt: '2026-11-11T00:00:00.000Z' },
      'all-star-recognition-v1': {
        'own-star': star('own-star', mine),
        'other-star': star('other-star', other),
      },
      'star-card-prints-v1': {
        'own-star': { printedAt: '2026-11-11T18:00:00.000Z', recognitionIds: ['own-star'], printedBy: 'Lead' },
        'other-star': { printedAt: '2026-11-11T18:00:00.000Z', recognitionIds: ['other-star'], printedBy: 'Other' },
      },
    })
    const request = await authenticatedRequest({
      role: 'school',
      locationId: building,
      canEditRecognition: true,
    }, sessions)
    const response = await handleStateRequest(request, { stateStore: store, sessionStore: sessions })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.entries['star-card-prints-v1']['own-star'].printedBy, 'Lead')
    assert.equal(body.entries['star-card-prints-v1']['other-star'], undefined)

    const view = schoolStarCardPrintView(
      { 'other-star': { recognitionIds: ['other-star'] } },
      { 'other-star': star('other-star', other) },
      new Set([idOf(mine)]),
      [building],
    )
    assert.deepEqual(view, {})
  } finally {
    if (previousSecret === undefined) delete process.env.ATTENDANCE_SESSION_SECRET
    else process.env.ATTENDANCE_SESSION_SECRET = previousSecret
  }
})

// Jon, 2026-11-11: the main administrator can delete any recognition, and
// nobody else can delete an ordinary one — not another administrator, not a
// building. Until then only Employee of the Month removals were checked.
test('only the main administrator can delete a recognition', async () => {
  const employee = employees.find(row => row.location !== 'Admin')
  const star = {
    id: 'star-to-delete',
    employeeId: String(employee.kronos_id || employee.id),
    locationId: employee.location,
    type: 'star-of-day',
    date: '2026-11-05',
    monthKey: null,
    criteria: ['Teamwork'],
    note: 'Covered the line.',
    sourceName: '',
    recognizedBy: 'Someone',
    createdAt: '2026-11-05T15:00:00.000Z',
  }
  const store = stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'all-star-recognition-v1': { [star.id]: star },
  })
  const removal = { key: 'all-star-recognition-v1', mutation: { type: 'object-patch', set: {}, remove: [star.id] } }

  const building = { role: 'school', locationId: employee.location, canEditAttendance: true, canEditRecognition: true }
  for (const session of [building, drawingAdmin]) {
    const refused = await handleMutate(store, session, removal)
    assert.equal(refused.status, 403)
    assert.match((await refused.json()).error, /main administrator/)
    assert.deepEqual(Object.keys(await store.get('all-star-recognition-v1')), [star.id])
  }

  const mainAdministrator = { ...drawingAdmin, canManageRoster: true, canManageBlackouts: true }
  assert.equal((await handleMutate(store, mainAdministrator, removal)).status, 200)
  assert.deepEqual(Object.keys(await store.get('all-star-recognition-v1')), [])
})

test('a building cannot remove a drawing winner, and an administrator still can', async () => {
  const employee = employees.find(row => row.location !== 'Admin')
  const winner = { ...redrawnWinner(employee), id: 'winner-to-remove' }
  const store = stateStore({
    __state_meta__: { initializedAt: '2026-08-21T00:00:00Z' },
    'all-star-recognition-v1': { [winner.id]: winner },
  })
  const removal = { key: 'all-star-recognition-v1', mutation: { type: 'object-patch', set: {}, remove: [winner.id] } }

  const building = { role: 'school', locationId: employee.location, canEditAttendance: true, canEditRecognition: true }
  assert.equal((await handleMutate(store, building, removal)).status, 403)
  assert.equal((await handleMutate(store, drawingAdmin, removal)).status, 200)
  assert.deepEqual(Object.keys(await store.get('all-star-recognition-v1')), [])
})
