export const BLACKOUTS_KEY = 'attendance-blackout-dates'
export const LOCATION_OVERRIDES_KEY = 'employee-location-overrides'
export const RECORD_OVERRIDES_KEY = 'employee-record-overrides'
export const CUSTOM_EMPLOYEES_KEY = 'employee-custom-records'
export const EMPLOYEE_NOTES_KEY = 'employee-manager-notes-v1'
export const ASSIGNMENT_HISTORY_KEY = 'employee-assignment-history-v1'
export const TRAINING_KEY = 'training-records-v1'
export const PROGRAM_SETTINGS_KEY = 'program-settings-v1'
export const APPROVALS_KEY = 'pending-approvals-v1'
export const RECOGNITION_KEY = 'all-star-recognition-v1'
export const HR_STATUS_KEY = 'hr-attendance-progress-v2'
export const LEGACY_HR_STATUS_KEY = 'hr-flags'

export const ROSTER_KEYS = new Set([
  LOCATION_OVERRIDES_KEY,
  RECORD_OVERRIDES_KEY,
  CUSTOM_EMPLOYEES_KEY,
  // Assignment history is written by the same act that changes a location, so
  // it carries the same permission as the transfer itself. Keeping it here
  // rather than on its own line means a future change to roster permissions
  // cannot leave the history writable when the transfer is not.
  ASSIGNMENT_HISTORY_KEY,
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
  ASSIGNMENT_HISTORY_KEY,
  RECOGNITION_KEY,
  TRAINING_KEY,
  PROGRAM_SETTINGS_KEY,
  APPROVALS_KEY,
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
  if (isRecognitionState && !canEditRecognition) return false

  if (session.role === 'school') {
    if (attendanceId) return allowedEmployeeIds.has(String(attendanceId))
    // Recognition is written by building managers for their own team. The rows
    // themselves are narrowed to this building's roster in handleMutate, so
    // reaching the key is not the same as reaching another building's staff.
    return key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY || isRecognitionState
  }

  if (session.role !== 'admin') return false
  if (isAttendanceState) return true
  if (isRecognitionState) return true
  if (key === EMPLOYEE_NOTES_KEY) return session.canEditAttendance !== false
  // Professional Standards hours are a compliance record kept at district
  // level: the entry form selects across every school at once. A read-only
  // admin must not write them, hence the roster-management bar rather than
  // canEditAttendance.
  if (key === TRAINING_KEY) return session.canManageRoster === true
  // District-wide programme policy. Liz's tier only — these change what the
  // app says about somebody's job.
  if (key === PROGRAM_SETTINGS_KEY) {
    return session.canManageRoster === true && session.canManageBlackouts === true
  }
  // Every roster change goes through Liz's review (her instruction,
  // 2026-10-19), so changing the roster is a full district administrator's
  // act. A limited administrator proposes instead, by writing to the
  // approvals key below.
  //
  // This is enforced on the server deliberately. The browser already refused
  // card edits and new employees at this tier, but a refusal that lives only
  // in the page is a suggestion: the state endpoint would still have accepted
  // the write. Transfers were not even refused in the page.
  if (ROSTER_KEYS.has(key)) {
    return session.canManageRoster === true && session.canManageBlackouts === true
  }
  // Proposing is the other half of the same rule, so any administrator who
  // holds roster rights may write here — that is precisely the person who can
  // no longer change the roster directly. Liz writes here too, to record her
  // decision.
  if (key === APPROVALS_KEY) return session.canManageRoster === true
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
