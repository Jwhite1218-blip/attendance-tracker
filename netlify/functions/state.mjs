import { randomUUID } from 'node:crypto'
import employees from '../../src/data/employees.json' with { type: 'json' }
import { CODE_MAP } from '../../src/data/attendanceCodes.js'
import { hasLizAdminAccess } from '../../src/data/futureTools.js'
import { validateEmploymentChanges } from '../../src/data/employmentStatus.js'
import { monthlyDrawingStatus, recognitionTypeAllowedForRole } from '../../src/data/recognitionRules.js'
import { applyStateMutation, createStateMutation } from '../../src/data/stateMutations.js'
import { jsonResponse } from './_shared/auth.mjs'
import { validatedSessionFromRequest } from './_shared/server-session.mjs'
import { getStateStore } from './_shared/state-store.mjs'
import {
  BLACKOUTS_KEY,
  CUSTOM_EMPLOYEES_KEY,
  EMPLOYEE_NOTES_KEY,
  HR_STATUS_KEY,
  LEGACY_HR_STATUS_KEY,
  PROGRAM_SETTINGS_KEY,
  LOCATION_OVERRIDES_KEY,
  RECOGNITION_KEY,
  RECORD_OVERRIDES_KEY,
  attendanceEmployeeId,
  canWriteStateKey,
  filterStatusesForEmployees,
  isManagedStateKey,
} from './_shared/permissions.mjs'

const META_KEY = '__state_meta__'
const PRE_RESTORE_BACKUP_KEY = '__state_backup_before_restore__'
const BACKUP_FORMAT = 'warren-attendance-backup'
const BACKUP_VERSION = 1
const BACKUP_MAX_BYTES = 25 * 1024 * 1024
const BACKUP_MAX_KEYS = 5000
const RESTORE_CONFIRMATION = 'RESTORE'

function employeeKey(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

function withoutLizOnlyEmployeeFields(employee) {
  if (!employee || typeof employee !== 'object' || Array.isArray(employee)) return employee
  const { t_shirt_size: _tShirtSize, ...publicEmployeeFields } = employee
  return publicEmployeeFields
}

function redactRecordOverrides(records) {
  return Object.fromEntries(
    Object.entries(records || {}).map(([employeeId, record]) => [
      employeeId,
      withoutLizOnlyEmployeeFields(record),
    ])
  )
}

function redactCustomEmployees(records) {
  return (Array.isArray(records) ? records : []).map(withoutLizOnlyEmployeeFields)
}

function redactLizOnlyEmployeeEntries(entries) {
  const redacted = { ...entries }
  if (redacted[RECORD_OVERRIDES_KEY]) {
    redacted[RECORD_OVERRIDES_KEY] = redactRecordOverrides(redacted[RECORD_OVERRIDES_KEY])
  }
  if (Array.isArray(redacted[CUSTOM_EMPLOYEES_KEY])) {
    redacted[CUSTOM_EMPLOYEES_KEY] = redactCustomEmployees(redacted[CUSTOM_EMPLOYEES_KEY])
  }
  return redacted
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

  const milestones = {
    hire_date: employee.hire_date || '',
    service_date: employee.service_date || '',
    birthdate: employee.birthdate || '',
  }

  if (session.recognitionOnly === true) return shared
  if (!hasLizAdminAccess(session)) return { ...shared, ...milestones }
  return {
    ...shared,
    ...milestones,
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

function createBackupPayload(entries, session, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    exportedBy: String(session.displayName || 'Liz administrator').slice(0, 200),
    entries,
  }
}

function emptyManagedValue(key) {
  return key === BLACKOUTS_KEY || key === CUSTOM_EMPLOYEES_KEY ? [] : {}
}

function backupEntriesFromPayload(backup) {
  if (
    !backup
    || typeof backup !== 'object'
    || Array.isArray(backup)
    || backup.format !== BACKUP_FORMAT
    || backup.version !== BACKUP_VERSION
    || !backup.entries
    || typeof backup.entries !== 'object'
    || Array.isArray(backup.entries)
  ) {
    throw new Error('The selected file is not a supported Warren attendance backup.')
  }

  const serialized = JSON.stringify(backup)
  if (serialized.length > BACKUP_MAX_BYTES) throw new Error('The selected backup is too large.')

  const entries = backup.entries
  const keys = Object.keys(entries)
  if (keys.length > BACKUP_MAX_KEYS) throw new Error('The selected backup contains too many data sections.')
  for (const key of keys) {
    if (!isManagedStateKey(key)) throw new Error('The selected backup contains an unsupported data section.')
    const value = entries[key]
    const requiresArray = key === BLACKOUTS_KEY || key === CUSTOM_EMPLOYEES_KEY
    if (requiresArray ? !Array.isArray(value) : (!value || typeof value !== 'object' || Array.isArray(value))) {
      throw new Error('The selected backup contains an invalid data section.')
    }
  }
  return entries
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
  // Programme settings go to every session, including the narrowest ones.
  // They are district policy, not personal data, and a session that does not
  // receive them falls back to the shipped defaults — so a manager would see
  // different milestones and different occurrence colours from Liz, with
  // nothing on screen to say why.
  const programSettings = entries[PROGRAM_SETTINGS_KEY]
    ? { [PROGRAM_SETTINGS_KEY]: entries[PROGRAM_SETTINGS_KEY] }
    : {}

  if (session.recognitionOnly === true) {
    return {
      ...programSettings,
      ...(entries[RECOGNITION_KEY] ? { [RECOGNITION_KEY]: entries[RECOGNITION_KEY] } : {}),
    }
  }
  if (hasLizAdminAccess(session)) return entries
  if (session.role === 'admin') return redactLizOnlyEmployeeEntries(entries)

  const allowedEmployeeIds = allowedEmployeeIdsForSchool(entries, session.locationId)
  const filtered = { ...programSettings }

  if (entries[BLACKOUTS_KEY]) filtered[BLACKOUTS_KEY] = entries[BLACKOUTS_KEY]
  if (entries[LOCATION_OVERRIDES_KEY]) {
    filtered[LOCATION_OVERRIDES_KEY] = filterRecordMap(entries[LOCATION_OVERRIDES_KEY], allowedEmployeeIds)
  }
  if (entries[RECORD_OVERRIDES_KEY]) {
    filtered[RECORD_OVERRIDES_KEY] = redactRecordOverrides(
      filterRecordMap(entries[RECORD_OVERRIDES_KEY], allowedEmployeeIds)
    )
  }
  if (Array.isArray(entries[CUSTOM_EMPLOYEES_KEY])) {
    filtered[CUSTOM_EMPLOYEES_KEY] = redactCustomEmployees(
      entries[CUSTOM_EMPLOYEES_KEY]
        .filter(employee => allowedEmployeeIds.has(employeeKey(employee)))
    )
  }
  // Manager HR notes are district-administrator records. School sessions do
  // not receive them, even though their roster remains school-scoped.
  if (entries[HR_STATUS_KEY]) {
    filtered[HR_STATUS_KEY] = filterStatusesForEmployees(entries[HR_STATUS_KEY], allowedEmployeeIds)
  }
  if (entries[LEGACY_HR_STATUS_KEY]) {
    filtered[LEGACY_HR_STATUS_KEY] = filterStatusesForEmployees(entries[LEGACY_HR_STATUS_KEY], allowedEmployeeIds)
  }

  // School managers receive only their own building's recognition board. The
  // same roster boundary is applied again to writes in handleMutate.
  if (entries[RECOGNITION_KEY]) {
    filtered[RECOGNITION_KEY] = Object.fromEntries(
      Object.entries(entries[RECOGNITION_KEY] || {})
        .filter(([, record]) => allowedEmployeeIds.has(String(record?.employeeId)))
    )
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

function recognitionMutationForSession(mutation, session, allowedEmployeeIds) {
  if (mutation?.type !== 'object-patch') return mutation
  // A building manager may only recognise their own team. Rows naming anyone
  // else are dropped rather than rejected: the session's own roster is the
  // authority, not whatever employee id the client sent.
  const scopedToSchool = session.role === 'school'
  return {
    ...mutation,
    set: Object.fromEntries(
      Object.entries(mutation.set || {})
        .filter(([, recognition]) => (
          !scopedToSchool || allowedEmployeeIds.has(String(recognition?.employeeId))
        ))
        .map(([recognitionId, recognition]) => [
          recognitionId,
          {
            ...recognition,
            recognizedBy: String(session.displayName || 'Authenticated manager').slice(0, 200),
            // Stamped from the session, never from the client: this is what lets
            // the district see which building handed out each star.
            recognizedByLocationId: String(session.locationId || 'district').slice(0, 100),
          },
        ])
    ),
  }
}

function isSameOriginRequest(request) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

function validateMutation(key, mutation, { allowEmployeeNoteRemovals = false } = {}) {
  applyStateMutation(key, null, mutation)
  if (key === EMPLOYEE_NOTES_KEY) {
    if (mutation.type !== 'object-patch' || (!allowEmployeeNoteRemovals && (mutation.remove || []).length > 0)) {
      throw new Error('Employee note changes must be an object patch without deletions.')
    }
    for (const [employeeId, entries] of Object.entries(mutation.set || {})) {
      if (!employeeId || employeeId.length > 200 || !Array.isArray(entries)) {
        throw new Error('Employee note changes contain an invalid entry.')
      }
      for (const entry of entries) {
        const validText = entry && typeof entry.text === 'string' && entry.text.length > 0 && entry.text.length <= 4000
        const validAuthor = typeof entry?.author === 'string' && entry.author.length <= 200
        const validAt = entry?.at === null || (typeof entry?.at === 'string' && !Number.isNaN(Date.parse(entry.at)))
        if (!validText || !validAuthor || !validAt) {
          throw new Error('Employee note changes contain an invalid entry.')
        }
      }
    }
    return
  }
  if (key === RECOGNITION_KEY) {
    if (mutation.type !== 'object-patch') throw new Error('Recognition changes must be an object patch.')
    const validTypes = new Set([
      'star-of-day',
      'shooting-star',
      'star-shout-out',
      'warren-employee-month',
      'all-star-of-month',
    ])
    const validDate = dateKey => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return false
      const date = new Date(`${dateKey}T00:00:00Z`)
      return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === dateKey
    }

    for (const [recognitionId, recognition] of Object.entries(mutation.set || {})) {
      if (!recognitionId || recognitionId.length > 200 || recognition?.id !== recognitionId) {
        throw new Error('Recognition changes contain an invalid identity.')
      }
      if (
        !recognition
        || typeof recognition !== 'object'
        || Array.isArray(recognition)
        || !validTypes.has(recognition.type)
        || !validDate(recognition.date)
        || !String(recognition.employeeId || '').trim()
        || String(recognition.employeeId).length > 200
        || !String(recognition.locationId || '').trim()
        || String(recognition.locationId).length > 200
      ) {
        throw new Error('Recognition changes contain an invalid record.')
      }
      if (
        !Array.isArray(recognition.criteria)
        || recognition.criteria.length > 12
        || recognition.criteria.some(value => typeof value !== 'string' || value.length > 300)
      ) {
        throw new Error('Recognition changes contain invalid criteria.')
      }
      if (
        typeof recognition.note !== 'string'
        || recognition.note.length > 1000
        || typeof recognition.sourceName !== 'string'
        || recognition.sourceName.length > 200
        || typeof recognition.recognizedBy !== 'string'
        || recognition.recognizedBy.length > 200
        // Optional so records written before submitter attribution stay valid.
        || (recognition.recognizedByLocationId !== undefined
          && (typeof recognition.recognizedByLocationId !== 'string'
            || recognition.recognizedByLocationId.length > 100))
        || typeof recognition.createdAt !== 'string'
        || Number.isNaN(Date.parse(recognition.createdAt))
      ) {
        throw new Error('Recognition changes contain invalid supporting details.')
      }
      if (recognition.type === 'all-star-of-month') {
        if (!/^\d{4}-\d{2}$/.test(String(recognition.monthKey || ''))) {
          throw new Error('Monthly All-Star changes require a valid month.')
        }
        if (!monthlyDrawingStatus(recognition.monthKey).isOpen) {
          throw new Error('The monthly drawing is not open yet.')
        }
      } else if (recognition.monthKey !== null) {
        throw new Error('Only monthly All-Star records may contain a drawing month.')
      }
    }
    if ((mutation.remove || []).some(value => !String(value || '').trim() || String(value).length > 200)) {
      throw new Error('Recognition changes contain an invalid removal identity.')
    }
    return
  }
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

export async function handleBackupRestore(store, session, body) {
  if (!hasLizAdminAccess(session)) {
    return jsonResponse({ error: 'Only Liz administrator access can restore a full backup.' }, 403)
  }
  if (String(body.confirmation || '') !== RESTORE_CONFIRMATION) {
    return jsonResponse({ error: 'Type RESTORE to confirm the recovery operation.' }, 400)
  }

  let backupEntries
  let currentEntries
  let targetEntries
  try {
    backupEntries = backupEntriesFromPayload(body.backup)
    currentEntries = await loadEntries(store)
    const keys = new Set([...Object.keys(currentEntries), ...Object.keys(backupEntries)])
    targetEntries = Object.fromEntries([...keys].map(key => [
      key,
      Object.hasOwn(backupEntries, key) ? backupEntries[key] : emptyManagedValue(key),
    ]))

    for (const [key, value] of Object.entries(targetEntries)) {
      const mutation = createStateMutation(key, currentEntries[key] ?? null, value)
      validateMutation(key, mutation, { allowEmployeeNoteRemovals: true })
    }
  } catch (error) {
    return jsonResponse({ error: error.message || 'The selected backup is invalid.' }, 400)
  }

  const actor = String(session.displayName || 'Liz administrator').slice(0, 200)
  await store.setJSON(PRE_RESTORE_BACKUP_KEY, createBackupPayload(currentEntries, session), actor)

  const writtenKeys = []
  try {
    for (const [key, value] of Object.entries(targetEntries)) {
      await store.setJSON(key, value, actor)
      writtenKeys.push(key)
    }
  } catch (error) {
    await Promise.allSettled(writtenKeys.map(key => (
      store.setJSON(key, currentEntries[key] ?? emptyManagedValue(key), `${actor} automatic rollback`)
    )))
    throw error
  }

  return jsonResponse({
    ok: true,
    restoredAt: new Date().toISOString(),
    restoredSections: Object.keys(targetEntries).length,
  })
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
  if ((key === RECORD_OVERRIDES_KEY || key === CUSTOM_EMPLOYEES_KEY) && !hasLizAdminAccess(session)) {
    return jsonResponse({ error: 'Only Liz administrator access can change employee-card details.' }, 403)
  }

  let mutation = body.mutation
  if (
    key === RECOGNITION_KEY
    && mutation?.type === 'object-patch'
    && Object.values(mutation.set || {}).some(recognition => (
      !recognitionTypeAllowedForRole(
        session.role,
        recognition?.type,
        session.canManageRecognitionAwards !== false && session.recognitionOnly !== true
      )
    ))
  ) {
    return jsonResponse({ error: 'Only a district administrator can record Warren Food Services Employee of the Month.' }, 403)
  }
  if (key === RECOGNITION_KEY) mutation = recognitionMutationForSession(mutation, session, allowedEmployeeIds)
  try {
    validateMutation(key, mutation)
  } catch {
    return jsonResponse({ error: 'The requested state change is invalid.' }, 400)
  }

  if (session.role === 'school' && (key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY)) {
    const currentValue = await store.get(key, { type: 'json' })
    mutation = schoolStatusMutation(mutation, currentValue, allowedEmployeeIds)
  }

  if (key === RECORD_OVERRIDES_KEY) {
    const current = await store.get(key, { type: 'json' })
    try {
      validateEmploymentChanges(current, applyStateMutation(key, current, mutation))
    } catch (error) {
      return jsonResponse({ error: error.message }, 400)
    }
  }

  const value = await store.updateJSON(key, mutation, session.displayName || 'authenticated user')
  let publicValue = session.role === 'school' && (key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY)
    ? filterStatusesForEmployees(value, allowedEmployeeIds)
    : value
  if (!hasLizAdminAccess(session) && key === RECORD_OVERRIDES_KEY) {
    publicValue = redactRecordOverrides(publicValue)
  }
  if (!hasLizAdminAccess(session) && key === CUSTOM_EMPLOYEES_KEY) {
    publicValue = redactCustomEmployees(publicValue)
  }
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
    if (new URL(request.url).searchParams.get('action') === 'backup') {
      if (!hasLizAdminAccess(session)) {
        return jsonResponse({ error: 'Only Liz administrator access can download a full backup.' }, 403)
      }
      const dateKey = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      return jsonResponse(createBackupPayload(entries, session), 200, {
        'Content-Disposition': `attachment; filename="warren-attendance-backup-${dateKey}.json"`,
      })
    }
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
    if (body.action === 'restore-backup') return handleBackupRestore(store, session, body)
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
