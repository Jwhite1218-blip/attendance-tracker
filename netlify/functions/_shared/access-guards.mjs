// The rules that stop somebody locking the district out of its own tracker.
//
// Pure functions, separate from the endpoint, because each of these is a
// real way to break sign-in for nineteen people and they deserve tests that
// do not involve HTTP. The page enforces the same rules for a decent
// experience; these are the ones that actually hold.
import { LOCATIONS } from '../../../src/data/locations.js'
import { hasLizAdminAccess } from '../../../src/data/futureTools.js'

export class GuardError extends Error {}

function refuse(message) {
  throw new GuardError(message)
}

const CAPABILITY_FLAGS = [
  // Seeing, as distinct from doing. Liz, 2026-10-26.
  'canViewAttendance',
  'canViewTraining',
  'canViewBlackouts',
  'canViewReports',
  'canEditAttendance',
  'canEditRecognition',
  'canManageRecognitionAwards',
  'canManageRoster',
  'canManageBlackouts',
  'recognitionOnly',
]

const LOCATION_IDS = new Set(LOCATIONS.map(location => location.id))

export function normalizeCapabilities(input, { primaryLocationId = null } = {}) {
  const capabilities = {}
  for (const flag of CAPABILITY_FLAGS) {
    if (typeof input?.[flag] === 'boolean') capabilities[flag] = input[flag]
  }
  // The extra kitchens a manager covers travel with the other flags rather
  // than in a column of their own, so this needed no migration.
  if (input?.locationIds !== undefined) {
    const extras = normalizeExtraLocations(input.locationIds, primaryLocationId)
    if (extras.length) capabilities.locationIds = extras
  }
  return capabilities
}

export function assertValidPin(pin) {
  const value = String(pin ?? '').trim()
  if (!/^\d{4,8}$/.test(value)) refuse('A code must be 4 to 8 digits.')
  return value
}

// Which person this login belongs to.
//
// Liz, 2026-10-26: linking a manager's PIN to their employee card, so that
// signing in shows them their own recognition. Empty means not linked,
// which is the normal state for a shared building login that is not one
// person.
export function normalizeEmployeeLink(value) {
  if (value === null || value === undefined || value === '') return null
  const id = String(value).trim()
  if (!id) return null
  if (id.length > 80) refuse('That employee identifier is too long.')
  return id
}

// The extra kitchens a school login covers, beyond its primary.
//
// Liz, 2026-10-26. Unknown names are refused rather than dropped: a
// silently ignored school is a manager who cannot see a roster and no
// explanation anywhere.
export function normalizeExtraLocations(value, primary) {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) refuse('Extra schools must be a list.')
  const extras = []
  for (const entry of value) {
    const id = String(entry || '').trim()
    if (!id || id === primary) continue
    if (!LOCATION_IDS.has(id)) refuse(`${id} is not one of the district's schools.`)
    if (!extras.includes(id)) extras.push(id)
  }
  return extras
}

// The username a login signs in with, beside its PIN.
//
// Liz, 2026-10-26: first initial and last name, "eschmitt for example".
// Lowercased here so that the thing stored, the thing compared and the
// thing the unique index sees are all the same string — a username that
// only works when typed with the same capitalisation is a support call.
//
// Letters, digits, dot, dash and underscore. No spaces and no @, because a
// username that looks like an email address invites somebody to type their
// email address, and that is not what this is.
//
// Empty means no username, which is a profile that signs in with its PIN
// alone — the state every login is in until Liz changes one.
export function normalizeUsername(value) {
  if (value === null || value === undefined) return null
  const username = String(value).trim().toLowerCase()
  if (!username) return null
  if (username.length < 3) refuse('A username needs at least three characters.')
  if (username.length > 40) refuse('That username is too long.')
  if (!/^[a-z0-9._-]+$/.test(username)) {
    refuse('A username can use letters, numbers, dots, dashes and underscores — no spaces.')
  }
  return username
}

// Administrators first, per Liz on 2026-10-26. A building login that
// acquired a username would stop working the moment its manager typed only
// a PIN, and the fifteen of them are the least able to ring somebody about
// it. The database carries the same rule, so neither side can be the only
// thing standing between a manager and their roster.
export function assertUsernameAllowedForRole(username, role) {
  if (username && role !== 'admin') {
    refuse('Usernames are for administrator logins for now. A school login signs in with its PIN.')
  }
}

export function assertValidProfileInput({ displayName, role, locationId }) {
  const name = String(displayName || '').trim()
  if (!name) refuse('Give this login a name.')
  if (name.length > 80) refuse('That name is too long.')
  if (role !== 'admin' && role !== 'school') refuse('Choose whether this is a school or district login.')
  // A school login with no building is refused by normalizeAccessProfile at
  // sign-in, so it would be a credential that exists and cannot be used.
  if (role === 'school') {
    if (!locationId || !LOCATION_IDS.has(locationId)) refuse('Choose which school this login is for.')
  }
  return { displayName: name, role, locationId: role === 'school' ? locationId : null }
}

// Nobody can hand out more than they hold. Today everyone who reaches this
// endpoint is Liz-tier so it never bites, but it is the rule that keeps a
// future lower tier from promoting itself.
export function assertNoPrivilegeEscalation(actorSession, capabilities) {
  for (const [flag, value] of Object.entries(capabilities)) {
    if (value !== true) continue
    if (flag === 'recognitionOnly') continue
    if (actorSession?.[flag] !== true) refuse(`You cannot grant ${flag} because you do not have it.`)
  }
}

// Matching on id when the session has one, and on name when it does not.
// A session created before migration carries a credential fingerprint
// rather than a profileId, and "do not let somebody disable themselves"
// should not quietly stop applying for those.
export function isOwnProfile(actorSession, profile) {
  if (!profile) return false
  if (actorSession?.profileId && actorSession.profileId === profile.id) return true
  const sessionName = String(actorSession?.displayName || '').trim().toLowerCase()
  const profileName = String(profile.display_name || '').trim().toLowerCase()
  return Boolean(sessionName) && sessionName === profileName
}

export function assertNotSelfLockout(actorSession, profile, change) {
  if (!isOwnProfile(actorSession, profile)) return
  if (change.disabling) refuse('You cannot disable your own login.')
  if (change.capabilities) {
    const losing = ['canManageRoster', 'canManageBlackouts']
      .filter(flag => profile.capabilities?.[flag] === true && change.capabilities[flag] !== true)
    if (losing.length) refuse('You cannot remove your own administrator access.')

    // Hiding an area from yourself is a one-way door, and the door it shuts
    // is the one you would need to open it again: nobody may grant a
    // capability they do not hold, so a district administrator who hides
    // attendance from their own login cannot give it back. That is exactly
    // how the award-draws capability was lost on 2026-10-19, and it needed
    // SQL to undo.
    //
    // Note the comparison is against "not explicitly false" rather than
    // "=== true". These flags are normally absent, meaning held, so reading
    // the stored value the way the line above does would miss every real
    // case.
    const hidingFromSelf = ['canViewAttendance', 'canViewTraining', 'canViewBlackouts', 'canViewReports']
      .filter(flag => profile.capabilities?.[flag] !== false && change.capabilities[flag] === false)
    if (hidingFromSelf.length) {
      refuse('You cannot hide a section from your own login — you would not be able to switch it back on. Make a second login to see what the restricted view looks like.')
    }
  }
}

function isLizTier(profile) {
  if (profile.disabled_at) return false
  return hasLizAdminAccess({
    role: profile.role,
    canManageRoster: profile.capabilities?.canManageRoster,
    canManageBlackouts: profile.capabilities?.canManageBlackouts,
  })
}

// The one that matters most. Removing the last full administrator leaves a
// district that cannot manage its own access, and the only way back is a
// developer writing SQL.
export function assertNotLastAdministrator(allProfiles, profile, change) {
  if (!isLizTier(profile)) return
  const stillAdminAfter = change.disabling
    ? false
    : hasLizAdminAccess({
      role: change.role ?? profile.role,
      canManageRoster: (change.capabilities ?? profile.capabilities)?.canManageRoster,
      canManageBlackouts: (change.capabilities ?? profile.capabilities)?.canManageBlackouts,
    })
  if (stillAdminAfter) return

  const others = (allProfiles || []).filter(other => other.id !== profile.id && isLizTier(other))
  if (!others.length) {
    refuse('This is the last full administrator. Give somebody else that access first.')
  }
}
