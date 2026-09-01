export function hasLizAdminAccess(access = {}) {
  return access.role === 'admin'
    && access.canManageRoster === true
    && access.canManageBlackouts === true
}

export function canSeeLizFutureTools(access = {}) {
  return hasLizAdminAccess(access)
}

// District admins run the program; school managers get read-only visibility of
// their own building's board so they can see their team's stars ahead of the
// rollout. Entry stays admin-only — enforced server-side in canWriteStateKey,
// not just hidden here.
export function canAccessRecognitionProgram(access = {}) {
  return access.role === 'admin' || access.role === 'school'
}

export function canViewBlackoutCalendar(access = {}) {
  if (access.role !== 'admin') return false
  return access.canManageBlackouts === true || access.canEditAttendance === false
}
