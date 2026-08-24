export function hasLizAdminAccess(access = {}) {
  return access.role === 'admin'
    && access.canManageRoster === true
    && access.canManageBlackouts === true
}

export function canSeeLizFutureTools(access = {}) {
  return hasLizAdminAccess(access)
}
