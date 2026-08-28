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

export function attendanceEmployeeId(key) {
  return String(key || '').match(/^att-emp-(.+)-\d{4}$/)?.[1] || null
}

export function isManagedStateKey(key) {
  return Boolean(attendanceEmployeeId(key)) || [
    BLACKOUTS_KEY,
    ...ROSTER_KEYS,
    EMPLOYEE_NOTES_KEY,
    RECOGNITION_KEY,
    HR_STATUS_KEY,
    LEGACY_HR_STATUS_KEY,
  ].includes(key)
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
    return key === HR_STATUS_KEY || key === LEGACY_HR_STATUS_KEY || isRecognitionState
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
