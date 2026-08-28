import test from 'node:test'
import assert from 'node:assert/strict'
import employees from '../../../src/data/employees.json' with { type: 'json' }
import { createSessionToken, sessionFromRequest } from './auth.mjs'
import { registerServerSession } from './server-session.mjs'
import { createMemoryBlobStore } from './test-blob-store.mjs'
import { handleStateRequest } from '../state.mjs'

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

async function authenticatedRequest(access, sessions, options = {}) {
  const token = createSessionToken(access)
  const cookie = `attendance-session=${encodeURIComponent(token)}`
  const request = new Request('https://example.test/api/state', {
    ...options,
    headers: { cookie, ...(options.headers || {}) },
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
    assert.equal(body.roster[0].hire_date, employees[0].hire_date || '')
    assert.equal(body.roster[0].service_date, employees[0].service_date || '')
    assert.equal(Object.hasOwn(body.roster[0], 't_shirt_size'), false)

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
    assert.ok(schoolEmployee)
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
        [schoolId(schoolEmployee)]: 'District HR note',
        [schoolId(outsider)]: 'Other district HR note',
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
    assert.ok(body.roster.every(employee => employee.location === schoolEmployee.location))
    assert.equal(Object.hasOwn(body.entries['employee-location-overrides'], schoolId(outsider)), false)
    assert.deepEqual(body.entries['attendance-blackout-dates'], [
      { date: '2026-09-07', label: 'Labor Day' },
    ])
    assert.equal(body.roster[0].birthdate, schoolEmployee.birthdate || '')
    assert.equal(body.roster[0].hire_date, schoolEmployee.hire_date || '')
    assert.equal(body.roster[0].service_date, schoolEmployee.service_date || '')
    assert.equal(Object.hasOwn(body.roster[0], 'weekly_hours'), false)
    assert.equal(Object.hasOwn(body.roster[0], 'pay_amount'), false)
    assert.equal(Object.hasOwn(body.roster[0], 't_shirt_size'), false)
    assert.equal(body.entries['employee-record-overrides'][schoolId(schoolEmployee)].notes, 'School-visible note')
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
        [employeeId]: 'Shared HR note',
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
    assert.equal(limitedBody.entries['employee-manager-notes-v1'][employeeId], 'Shared HR note')

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
            set: { [employeeId]: 'Updated by restricted manager' },
            remove: [],
          },
        }),
      }
    )
    const limitedNoteResponse = await handleStateRequest(limitedNoteRequest, { stateStore: store, sessionStore: sessions })
    assert.equal(limitedNoteResponse.status, 200)
    assert.equal((await limitedNoteResponse.json()).value[employeeId], 'Updated by restricted manager')

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
