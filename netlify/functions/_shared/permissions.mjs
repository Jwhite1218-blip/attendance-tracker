export const BLACKOUTS_KEY = 'attendance-blackout-dates'
export const LOCATION_OVERRIDES_KEY = 'employee-location-overrides'
export const RECORD_OVERRIDES_KEY = 'employee-record-overrides'
export const CUSTOM_EMPLOYEES_KEY = 'employee-custom-records'
export const EMPLOYEE_NOTES_KEY = 'employee-manager-notes-v1'
export const RECOGNITION_KEY = 'all-star-recognition-v1'
export const HR_STATUS_KEY = 'hr-attendance-progress-v2'
export const LEGACY_HR_STATUS_KEY = 'hr-flags'

export const ROSTER_KEYS = new Set([
  LOCATION_OVERRIDES_KEY,
  RECORD_OVERRIDES_KEY,
  CUSTOM_EMPLOYEES_KEY,
])

// Canonical list of every non-attendance state key the application is allowed
// to write. This is the single source of truth for the server; the client list
// in src/data/sharedStore.js and the SQL allowlist inside
// public.mutate_legacy_state_entry must both stay in step with it.
// state-key-parity.test.mjs enforces that.
export const MANAGED_FIXED_STATE_KEYS = Object.freeze([
  BLACKOUTS_KEY,
  LOCATION_OVERRIDES_KEY,
  RECORD_OVERRIDES_KEY,
  CUSTOM_EMPLOYEES_KEY,
  EMPLOYEE_NOTES_KEY,
  RECOGNITION_KEY,
  HR_STATUS_KEY,
  LEGACY_HR_STATUS_KEY,
])

export const ATTENDANCE_STATE_KEY_PATTERN = /^att-emp-.+-\d{4}$/

export function attendanceEmployeeId(key) {
  return String(key || '').match(/^att-emp-(.+)-\d{4}$/)?.[1] || null
}

export function isManagedStateKey(key) {
  return Boolean(attendanceEmployeeId(key)) || MANAGED_FIXED_STATE_KEYS.includes(key)
}

export function canWriteStateKey(session, key, allowedEmployeeIds = new Set()) {
  const attendanceId = attendanceEmployeeId(key)
  const isAttendanceState = Boolean(attendanceId) || key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY
  const isRecognitionState = key === RECOGNITION_KEY
  const canEditRecognition = session.canEditRecognition === true
    || (session.canEditRecognition === undefined && session.canEditAttendance !== false)

  if (isAttendanceState && session.canEditAttendance === false) return false
  if (isRecognitionState && (session.role !== 'admin' || !canEditRecognition)) return false

  if (session.role === 'school') {
    if (attendanceId) return allowedEmployeeIds.has(String(attendanceId))
    return key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY
  }

  if (session.role !== 'admin') return false
  if (isAttendanceState) return true
  if (isRecognitionState) return true
  if (key === EMPLOYEE_NOTES_KEY) return session.canEditAttendance !== false
  if (ROSTER_KEYS.has(key)) return session.canManageRoster === true
  if (key === BLACKOUTS_KEY) return session.canManageBlackouts === true
  return false
}

export function filterStatusesForEmployees(statuses, allowedEmployeeIds) {
  return Object.fromEntries(
    Object.entries(statuses || {}).filter(([, status]) =>
      allowedEmployeeIds.has(String(status?.empId))
    )
  )
}

export function mergeSchoolStatuses(current, proposed, allowedEmployeeIds) {
  const preserved = Object.fromEntries(
    Object.entries(current || {}).filter(([, status]) =>
      !allowedEmployeeIds.has(String(status?.empId))
    )
  )
  return { ...preserved, ...filterStatusesForEmployees(proposed, allowedEmployeeIds) }
}
