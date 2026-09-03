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

export function canViewBlackoutCalendar(access = {}) {
  if (access.role !== 'admin') return false
  return access.canManageBlackouts === true || access.canEditAttendance === false
}
