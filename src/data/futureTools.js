export function hasLizAdminAccess(access = {}) {
  return access.role === 'admin'
    && access.canManageRoster === true
    && access.canManageBlackouts === true
}

export function canSeeLizFutureTools(access = {}) {
  return hasLizAdminAccess(access)
}

export function canViewBlackoutCalendar(access = {}) {
  if (access.role === 'school') return true
  if (access.role !== 'admin') return false
  return access.canManageBlackouts === true || access.canEditAttendance === false
}
