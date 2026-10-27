export function hasLizAdminAccess(access = {}) {
  return access.role === 'admin'
    && access.canManageRoster === true
    && access.canManageBlackouts === true
}

export function canSeeLizFutureTools(access = {}) {
  return hasLizAdminAccess(access)
}

// District admins run the cross-building program; school managers can view and
// record recognition only for their own building. The server owns that scope
// boundary and keeps district-level awards administrator-only.
export function canAccessRecognitionProgram(access = {}) {
  return access.role === 'admin' || access.role === 'school'
}

// Resolved on the server by normalizeAccessProfile, which is the single
// place these are decided. Read the flag when it is present; fall back to
// the pre-2026-10-26 rule only for a session minted before the flag existed.
export function canViewBlackoutCalendar(access = {}) {
  if (access.role !== 'admin') return false
  if (typeof access.canViewBlackouts === 'boolean') return access.canViewBlackouts
  return access.canManageBlackouts === true || access.canEditAttendance === false
}

export function canViewAttendance(access = {}) {
  if (access.role === 'school') return true
  if (access.role !== 'admin') return false
  if (access.recognitionOnly === true) return false
  if (typeof access.canViewAttendance === 'boolean') return access.canViewAttendance
  return true
}

// Liz, 2026-10-26: Reports became a per-login choice like attendance and
// training. Absent means held, matching the server's resolver.
export function canViewReports(access = {}) {
  if (access.role !== 'admin') return false
  if (access.recognitionOnly === true) return false
  if (typeof access.canViewReports === 'boolean') return access.canViewReports
  return true
}

export function canViewTraining(access = {}) {
  if (access.role !== 'admin') return false
  if (access.recognitionOnly === true) return false
  if (typeof access.canViewTraining === 'boolean') return access.canViewTraining
  return true
}
