// The source roster is delivered only after server authentication and kept in
// sessionStorage. It is intentionally not imported into the public JS bundle.

import { normalizeBirthday } from './employeeFields.js'
import { validateInactiveDetails } from './employmentStatus.js'
import { ROSTER_SESSION_KEY, writeSharedStorage } from './sharedStore.js'

const LOCATION_STORAGE_KEY = 'employee-location-overrides'
const RECORD_STORAGE_KEY = 'employee-record-overrides'
const EMPLOYEE_NOTES_KEY = 'employee-manager-notes-v1'
const CUSTOM_EMPLOYEES_KEY = 'employee-custom-records'

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

function writeStorage(key, value) {
  writeSharedStorage(key, value)
}

function employeeKey(employee) {
  return String(employee.kronos_id || employee.id)
}

export function getLocationOverrides() {
  return readStorage(LOCATION_STORAGE_KEY, {})
}

export function saveLocationOverrides(overrides) {
  writeStorage(LOCATION_STORAGE_KEY, overrides)
}

export function getEmployeeRecordOverrides() {
  return readStorage(RECORD_STORAGE_KEY, {})
}

export function getEmployeeManagerNotes() {
  return readStorage(EMPLOYEE_NOTES_KEY, {})
}

function saveEmployeeRecordOverrides(overrides) {
  writeStorage(RECORD_STORAGE_KEY, overrides)
}

export function getCustomEmployees() {
  return readStorage(CUSTOM_EMPLOYEES_KEY, [])
}

function saveCustomEmployees(customEmployees) {
  writeStorage(CUSTOM_EMPLOYEES_KEY, customEmployees)
}

function getSourceEmployees() {
  let sourceEmployees = []
  try {
    const roster = JSON.parse(sessionStorage.getItem(ROSTER_SESSION_KEY) || '[]')
    if (Array.isArray(roster)) sourceEmployees = roster
  } catch {
    sourceEmployees = []
  }
  return [...sourceEmployees, ...getCustomEmployees()]
}

// A single legacy overwritable string is migrated into a one-entry timestamped
// list on first read so older records still display under the new format.
function normalizeNoteEntries(rawNotes) {
  if (Array.isArray(rawNotes)) {
    return rawNotes.filter(entry => entry && typeof entry.text === 'string' && entry.text.trim())
  }
  if (typeof rawNotes === 'string' && rawNotes.trim()) {
    return [{ text: rawNotes.trim(), author: '', at: null }]
  }
  return []
}

function buildEmployee(employee, locationOverrides, recordOverrides, managerNotes) {
  const key = employeeKey(employee)
  const override = recordOverrides[key] || {}
  const hasManagerNote = Object.hasOwn(managerNotes, key)
  return {
    ...employee,
    ...override,
    location: locationOverrides[key] || override.location || employee.location,
    active: override.active !== false,
    notes: normalizeNoteEntries(hasManagerNote ? managerNotes[key] : override.notes),
    inactive_reason: override.inactive_reason || '',
    inactive_at: override.inactive_at || null,
  }
}

// Every roster list in the app is alphabetical by last name, then first name —
// the same order the Employee Records ledger shows. Sorting here rather than in
// each view is what puts a newly added employee in their proper place instead
// of at the bottom: custom employees are appended to the source roster, so any
// consumer that doesn't sort would otherwise show a new hire last.
export function compareEmployeesByName(left, right) {
  return `${left?.last_name || ''} ${left?.first_name || ''}`.trim()
    .localeCompare(`${right?.last_name || ''} ${right?.first_name || ''}`.trim(), undefined, { sensitivity: 'base' })
}

export function getEmployeesWithEffectiveLocations({ includeInactive = false } = {}) {
  const locationOverrides = getLocationOverrides()
  const recordOverrides = getEmployeeRecordOverrides()
  const managerNotes = getEmployeeManagerNotes()
  const allEmployees = getSourceEmployees()
    .map(employee => buildEmployee(employee, locationOverrides, recordOverrides, managerNotes))
    .sort(compareEmployeesByName)
  return includeInactive ? allEmployees : allEmployees.filter(employee => employee.active)
}

export function getEmployeeByKey(empId, { includeInactive = true } = {}) {
  return getEmployeesWithEffectiveLocations({ includeInactive })
    .find(employee => employeeKey(employee) === String(empId)) || null
}

export function getEffectiveLocation(empId) {
  return getEmployeeByKey(empId)?.location || null
}

export function transferEmployee(empKey, newLocationId) {
  const overrides = getLocationOverrides()
  overrides[String(empKey)] = newLocationId
  saveLocationOverrides(overrides)
}

export function getRosterForLocation(locationId) {
  return getEmployeesWithEffectiveLocations().filter(employee => employee.location === locationId)
}

export function getLocationCounts() {
  const counts = {}
  getEmployeesWithEffectiveLocations().forEach(employee => {
    const location = employee.location || 'Unknown'
    counts[location] = (counts[location] || 0) + 1
  })
  return counts
}

export function updateEmployeeRecord(empId, updates) {
  const key = String(empId)
  const overrides = getEmployeeRecordOverrides()
  overrides[key] = { ...(overrides[key] || {}), ...updates }
  saveEmployeeRecordOverrides(overrides)
  return getEmployeeByKey(key)
}

// Appends a new timestamped, attributed note. Existing entries are never
// edited or removed here, so a manager's earlier note can't be overwritten by
// the next person who opens the record.
export function addEmployeeNote(empId, text, author) {
  const trimmedText = String(text || '').trim()
  if (!trimmedText) return getEmployeeByKey(String(empId))

  const key = String(empId)
  const managerNotes = getEmployeeManagerNotes()
  const existing = normalizeNoteEntries(managerNotes[key])
  managerNotes[key] = [...existing, { text: trimmedText, author: String(author || '').trim(), at: new Date().toISOString() }]
  writeStorage(EMPLOYEE_NOTES_KEY, managerNotes)
  return getEmployeeByKey(key)
}

export function setEmployeeActive(empId, active, details = {}) {
  if (!active) validateInactiveDetails(details)
  return updateEmployeeRecord(empId, {
    active: Boolean(active),
    inactive_reason: active ? '' : details.inactive_reason.trim(),
    termination_date: active ? '' : details.termination_date,
    last_day_worked: active ? '' : details.last_day_worked,
    inactive_at: active ? null : new Date().toISOString(),
  })
}

export function addEmployee(input) {
  const sourceEmployees = getSourceEmployees()
  const personnelId = String(input.kronos_id || '').trim()
  if (!personnelId) throw new Error('Personnel ID is required.')
  if (sourceEmployees.some(employee => String(employee.kronos_id || '').toLowerCase() === personnelId.toLowerCase())) {
    throw new Error('That Personnel ID already exists.')
  }

  const maxId = sourceEmployees.reduce((max, employee) => {
    const id = Number(employee.id)
    return Number.isFinite(id) ? Math.max(max, id) : max
  }, 0)

  const employee = {
    id: maxId + 1,
    kronos_id: personnelId,
    first_name: String(input.first_name || '').trim(),
    last_name: String(input.last_name || '').trim(),
    position: String(input.position || '').trim(),
    location: String(input.location || '').trim(),
    hire_date: String(input.hire_date || '').trim(),
    service_date: String(input.service_date || '').trim(),
    birthdate: normalizeBirthday(input.birthdate),
    t_shirt_size: String(input.t_shirt_size || '').trim(),
    source: 'custom',
  }

  if (!employee.first_name || !employee.last_name || !employee.location) {
    throw new Error('First name, last name, and location are required.')
  }

  saveCustomEmployees([...getCustomEmployees(), employee])
  return employee
}
