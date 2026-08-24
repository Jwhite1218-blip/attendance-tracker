import { randomUUID } from 'node:crypto'
import employees from '../../src/data/employees.json' with { type: 'json' }
import { CODE_MAP } from '../../src/data/attendanceCodes.js'
import { applyStateMutation } from '../../src/data/stateMutations.js'
import { jsonResponse } from './_shared/auth.mjs'
import { validatedSessionFromRequest } from './_shared/server-session.mjs'
import { getStateStore } from './_shared/state-store.mjs'
import {
  BLACKOUTS_KEY,
  CUSTOM_EMPLOYEES_KEY,
  HR_STATUS_KEY,
  LEGACY_HR_STATUS_KEY,
  LOCATION_OVERRIDES_KEY,
  RECORD_OVERRIDES_KEY,
  attendanceEmployeeId,
  canWriteStateKey,
  filterStatusesForEmployees,
  isManagedStateKey,
} from './_shared/permissions.mjs'

const META_KEY = '__state_meta__'

function employeeKey(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

function publicEmployee(employee, session) {
  const shared = {
    id: employee.id,
    kronos_id: employee.kronos_id,
    first_name: employee.first_name || '',
    last_name: employee.last_name || '',
    position: employee.position || '',
    location: employee.location || '',
  }

  if (session.role === 'school') {
    return {
      ...shared,
      hire_date: employee.hire_date || '',
      service_date: employee.service_date || '',
      birthdate: employee.birthdate || '',
    }
  }

  if (session.role !== 'admin' || session.canManageRoster !== true) return shared
  return {
    ...shared,
    hire_date: employee.hire_date || '',
    service_date: employee.service_date || '',
    birthdate: employee.birthdate || '',
    t_shirt_size: employee.t_shirt_size || '',
  }
}

async function loadEntries(store) {
  const { blobs } = await store.list()
  const rows = await Promise.all(
    blobs
      .filter(blob => blob.key !== META_KEY && isManagedStateKey(blob.key))
      .map(async blob => [blob.key, await store.get(blob.key, { type: 'json' })])
  )
  return Object.fromEntries(rows.filter(([, value]) => value !== null))
}

async function loadSchoolRosterEntries(store) {
  const rows = await Promise.all(
    [LOCATION_OVERRIDES_KEY, RECORD_OVERRIDES_KEY, CUSTOM_EMPLOYEES_KEY]
      .map(async key => [key, await store.get(key, { type: 'json' })])
  )
  return Object.fromEntries(rows.filter(([, value]) => value !== null))
}

function allowedEmployeeIdsForSchool(entries, locationId) {
  const locationOverrides = entries[LOCATION_OVERRIDES_KEY] || {}
  const recordOverrides = entries[RECORD_OVERRIDES_KEY] || {}
  const customEmployees = Array.isArray(entries[CUSTOM_EMPLOYEES_KEY])
    ? entries[CUSTOM_EMPLOYEES_KEY]
    : []

  return new Set(
    [...employees, ...customEmployees]
      .filter(employee => {
        const key = employeeKey(employee)
        const recordOverride = recordOverrides[key] || {}
        const effectiveLocation = locationOverrides[key] || recordOverride.location || employee.location
        return effectiveLocation === locationId
      })
      .map(employeeKey)
  )
}

function filterRecordMap(records, allowedEmployeeIds) {
  return Object.fromEntries(
    Object.entries(records || {}).filter(([employeeId]) => allowedEmployeeIds.has(String(employeeId)))
  )
}

function filterEntriesForSession(entries, session) {
  if (session.role === 'admin') return entries

  const allowedEmployeeIds = allowedEmployeeIdsForSchool(entries, session.locationId)
  const filtered = {}

  if (entries[BLACKOUTS_KEY]) filtered[BLACKOUTS_KEY] = entries[BLACKOUTS_KEY]
  if (entries[LOCATION_OVERRIDES_KEY]) {
    filtered[LOCATION_OVERRIDES_KEY] = filterRecordMap(entries[LOCATION_OVERRIDES_KEY], allowedEmployeeIds)
  }
  if (entries[RECORD_OVERRIDES_KEY]) {
    filtered[RECORD_OVERRIDES_KEY] = filterRecordMap(entries[RECORD_OVERRIDES_KEY], allowedEmployeeIds)
  }
  if (Array.isArray(entries[CUSTOM_EMPLOYEES_KEY])) {
    filtered[CUSTOM_EMPLOYEES_KEY] = entries[CUSTOM_EMPLOYEES_KEY]
      .filter(employee => allowedEmployeeIds.has(employeeKey(employee)))
  }
  if (entries[HR_STATUS_KEY]) {
    filtered[HR_STATUS_KEY] = filterStatusesForEmployees(entries[HR_STATUS_KEY], allowedEmployeeIds)
  }
  if (entries[LEGACY_HR_STATUS_KEY]) {
    filtered[LEGACY_HR_STATUS_KEY] = filterStatusesForEmployees(entries[LEGACY_HR_STATUS_KEY], allowedEmployeeIds)
  }

  Object.entries(entries).forEach(([key, value]) => {
    const attendanceId = attendanceEmployeeId(key)
    if (attendanceId && allowedEmployeeIds.has(String(attendanceId))) filtered[key] = value
  })

  return filtered
}

function rosterForSession(entries, session) {
  if (session.role === 'admin') return employees.map(employee => publicEmployee(employee, session))
  const allowedEmployeeIds = allowedEmployeeIdsForSchool(entries, session.locationId)
  return employees
    .filter(employee => allowedEmployeeIds.has(employeeKey(employee)))
    .map(employee => publicEmployee(employee, session))
}

function schoolStatusMutation(mutation, currentValue, allowedEmployeeIds) {
  if (mutation?.type !== 'object-patch') throw new Error('School status changes must be an object patch.')

  const set = Object.fromEntries(
    Object.entries(mutation.set || {}).filter(([, status]) =>
      allowedEmployeeIds.has(String(status?.empId))
    )
  )
  const remove = (Array.isArray(mutation.remove) ? mutation.remove : [])
    .map(String)
    .filter(statusKey => allowedEmployeeIds.has(String(currentValue?.[statusKey]?.empId)))
  return { type: 'object-patch', set, remove }
}

function isSameOriginRequest(request) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

function validateMutation(key, mutation) {
  applyStateMutation(key, null, mutation)
  if (!attendanceEmployeeId(key)) return
  if (mutation.type !== 'object-patch') throw new Error('Attendance changes must be an object patch.')

  const expectedYear = key.match(/-([0-9]{4})$/)?.[1]
  const validDate = dateKey => {
    if (!new RegExp(`^${expectedYear}-[0-9]{2}-[0-9]{2}$`).test(String(dateKey))) return false
    const date = new Date(`${dateKey}T00:00:00Z`)
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === dateKey
  }

  for (const [dateKey, record] of Object.entries(mutation.set || {})) {
    if (!validDate(dateKey) || !record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('Attendance patch contains an invalid record.')
    }
    if (!CODE_MAP[String(record.code || '')] || record.date !== dateKey) {
      throw new Error('Attendance patch contains an invalid code or date.')
    }
    if (record.note !== undefined && (typeof record.note !== 'string' || record.note.length > 2000)) {
      throw new Error('Attendance comments cannot exceed 2,000 characters.')
    }
  }
  if (!(mutation.remove || []).every(validDate)) {
    throw new Error('Attendance patch contains an invalid removal date.')
  }
}

export async function handleMutate(store, session, body) {
  const key = String(body.key || '')
  const rosterEntries = session.role === 'school' ? await loadSchoolRosterEntries(store) : {}
  const allowedEmployeeIds = session.role === 'school'
    ? allowedEmployeeIdsForSchool(rosterEntries, session.locationId)
    : new Set()

  if (!isManagedStateKey(key) || !canWriteStateKey(session, key, allowedEmployeeIds)) {
    return jsonResponse({ error: 'You do not have permission to make that change.' }, 403)
  }

  let mutation = body.mutation
  try {
    validateMutation(key, mutation)
  } catch {
    return jsonResponse({ error: 'The requested state change is invalid.' }, 400)
  }

  if (session.role === 'school' && (key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY)) {
    const currentValue = await store.get(key, { type: 'json' })
    mutation = schoolStatusMutation(mutation, currentValue, allowedEmployeeIds)
  }

  const value = await store.updateJSON(key, mutation, session.displayName || 'authenticated user')
  const publicValue = session.role === 'school' && (key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY)
    ? filterStatusesForEmployees(value, allowedEmployeeIds)
    : value
  return jsonResponse({ ok: true, value: publicValue })
}

export async function handleStateRequest(request, { stateStore, sessionStore } = {}) {
  const session = await validatedSessionFromRequest(request, Date.now(), sessionStore)
  if (!session) return jsonResponse({ error: 'Authentication required.' }, 401)

  const store = stateStore || getStateStore()
  if (request.method === 'GET') {
    const [entries, meta] = await Promise.all([
      loadEntries(store),
      store.get(META_KEY, { type: 'json' }),
    ])
    return jsonResponse({
      initialized: Boolean(meta),
      entries: filterEntriesForSession(entries, session),
      roster: rosterForSession(entries, session),
    })
  }

  if (request.method === 'POST') {
    if (!isSameOriginRequest(request)) return jsonResponse({ error: 'Cross-origin state changes are not allowed.' }, 403)
    const parsedBody = await request.json().catch(() => null)
    const body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody) ? parsedBody : {}
    if (body.action === 'mutate') return handleMutate(store, session, body)
    return jsonResponse({ error: 'Unsupported state action.' }, 400)
  }

  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' })
}

export default async (request, context) => {
  const startedAt = Date.now()
  const requestId = context?.requestId || randomUUID()
  let response
  try {
    response = await handleStateRequest(request)
  } catch (error) {
    console.error(JSON.stringify({ event: 'state-error', requestId, message: error.message }))
    response = jsonResponse({ error: 'The shared attendance service is temporarily unavailable.', requestId }, 503)
  }
  response.headers.set('X-Request-ID', requestId)
  console.log(JSON.stringify({
    event: 'state-request',
    requestId,
    method: request.method,
    status: response.status,
    durationMs: Date.now() - startedAt,
  }))
  return response
}

export const config = {
  path: '/api/state',
}
