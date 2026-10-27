import { getAccessStore, profileFromRow, tableAuthEnabled } from './access-store.mjs'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { LOCATIONS } from '../../../src/data/locations.js'

export const SESSION_COOKIE = 'attendance-session'
const SESSION_DURATION_SECONDS = 8 * 60 * 60
const CHEF_ACCESS = Object.freeze({
  role: 'admin',
  displayName: 'Chef',
  canEditAttendance: true,
  canManageRoster: false,
  canManageBlackouts: false,
})
// District office staff who work across every school but do not run the
// programme: all buildings, attendance and recognition, but no roster edits,
// no blackout calendar, and no district award draws. This is the tier the
// header calls "Administrator (limited)".
//
// Written out rather than cloned, because unlike a peer administrator there
// is no existing entry at this tier to copy from.
const LIMITED_ADMIN_ACCESS = Object.freeze({
  role: 'admin',
  canEditAttendance: true,
  canEditRecognition: true,
  canManageRecognitionAwards: false,
  recognitionOnly: false,
  canManageRoster: false,
  canManageBlackouts: false,
})
const PRESENTATION_PILOT_ACCESS = Object.freeze({
  role: 'admin',
  canEditAttendance: true,
  canEditRecognition: true,
  canManageRecognitionAwards: true,
  recognitionOnly: false,
  canManageRoster: false,
  canManageBlackouts: false,
  watermark: 'localis',
})
// District Admin is a building like any other: Liz and the district office team
// work from it, and its staff need their attendance marked by someone scoped to
// that building rather than by a district-wide login. It was previously excluded
// here, which meant a building PIN for it was refused at sign-in.
const SCHOOL_LOCATIONS = LOCATIONS

function locationLookupKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

const SCHOOL_LOCATION_ALIASES = (() => {
  const aliases = new Map()
  const ambiguous = new Set()

  for (const location of SCHOOL_LOCATIONS) {
    for (const alias of [location.id, location.name, location.shortName]) {
      const key = locationLookupKey(alias)
      if (!key) continue
      const existing = aliases.get(key)
      if (existing && existing !== location.id) ambiguous.add(key)
      else aliases.set(key, location.id)
    }
  }

  for (const key of ambiguous) aliases.delete(key)
  return aliases
})()

export function normalizeSchoolLocationId(value) {
  return SCHOOL_LOCATION_ALIASES.get(locationLookupKey(value)) || null
}

export function normalizeAccessProfile(rawAccess, { defaultAdminManagement = true } = {}) {
  if (!rawAccess || typeof rawAccess !== 'object' || Array.isArray(rawAccess)) return null
  if (rawAccess.role !== 'admin' && rawAccess.role !== 'school') return null

  // Liz, 2026-10-26: a few managers cover several kitchens. A school login
  // therefore holds a list of buildings rather than one.
  //
  // locationId remains the primary — the first in the list — so everything
  // that asks "which building is this" keeps working unchanged, and a login
  // with one building is exactly what it was before. Duplicates and unknown
  // names fall out here rather than reaching the scoping code.
  const locationIds = rawAccess.role === 'school'
    ? [...new Set(
      [rawAccess.locationId, ...(Array.isArray(rawAccess.locationIds) ? rawAccess.locationIds : [])]
        .map(normalizeSchoolLocationId)
        .filter(Boolean)
    )]
    : []
  const locationId = locationIds[0] || null
  if (rawAccess.role === 'school' && !locationId) return null
  if (rawAccess.role === 'school' && rawAccess.recognitionOnly === true) return null

  const recognitionOnly = rawAccess.role === 'admin' && rawAccess.recognitionOnly === true

  // Seeing is decided before editing, and gates it.
  //
  // Liz, 2026-10-26: a district-wide login that runs the All-Stars programme
  // everywhere and sees none of the district's attendance. Until now the only
  // way to withhold attendance was recognitionOnly, which withholds the rest
  // of the application with it.
  //
  // View wins over edit, not the other way round. Unticking "can see" while
  // "can edit" is still ticked is a contradiction somebody will create by
  // accident, and the safe reading of it is the restrictive one — otherwise
  // unticking "see" would leave the records on screen.
  //
  // Absent means visible: no stored profile carries this field, so a default
  // of false would have blanked the application for nineteen people the
  // moment it deployed. A building login always sees its own attendance.
  const canViewAttendance = rawAccess.role === 'school' || (
    rawAccess.role === 'admin'
    && !recognitionOnly
    && rawAccess.canViewAttendance !== false
  )
  const canEditAttendance = !recognitionOnly
    && canViewAttendance
    && rawAccess.canEditAttendance !== false
  // Building managers record recognition for their own team: catching someone
  // shining is a building-level act, and a district office cannot do it daily
  // for fifteen kitchens. Their writes are still scoped to their own roster in
  // handleMutate, and the district-only award stays behind
  // canManageRecognitionAwards, which remains administrator-only below.
  // A building login always owns recognition for its own roster, even when its
  // attendance tools are intentionally read-only. The state endpoint still
  // scopes every school write to that building and keeps district awards behind
  // the administrator-only capability below.
  const canEditRecognition = rawAccess.role === 'school' || (
    rawAccess.role === 'admin'
    && (
      rawAccess.canEditRecognition === true
      || (rawAccess.canEditRecognition !== false && canEditAttendance)
    )
  )
  const canManageRoster = rawAccess.role === 'admin'
    && !recognitionOnly
    && canEditAttendance
    && (
      rawAccess.canManageRoster === true
      || (defaultAdminManagement && rawAccess.canManageRoster !== false)
    )
  const blackoutsManageable = rawAccess.role === 'admin'
    && !recognitionOnly
    && canEditAttendance
    && (
      rawAccess.canManageBlackouts === true
      || (defaultAdminManagement && rawAccess.canManageBlackouts !== false)
    )
  const canManageRecognitionAwards = rawAccess.role === 'admin'
    && canEditRecognition
    && !recognitionOnly
    && (
      rawAccess.canManageRecognitionAwards === true
      || (
        rawAccess.canManageRecognitionAwards !== false
        && canManageRoster
        && blackoutsManageable
      )
    )

  // The training page, same rule: absent means visible, and not seeing it
  // means not recording against it (enforced in canWriteStateKey).
  const canViewTraining = rawAccess.role === 'admin'
    && !recognitionOnly
    && rawAccess.canViewTraining !== false

  // The reports hub and everything under it. Liz, 2026-10-26, asked for
  // reports to be selectable per login like attendance and training.
  //
  // Absent means visible, so every login that could reach Reports this
  // morning still can. A recognition-only login never could and still
  // cannot — that tier is the All-Star pages and nothing else.
  const canViewReports = rawAccess.role === 'admin'
    && !recognitionOnly
    && rawAccess.canViewReports !== false

  // The default here reproduces the pre-2026-10-26 canViewBlackoutCalendar
  // rule rather than simply defaulting to true: before today an
  // administrator holding neither blackout management nor read-only
  // attendance did not see the calendar, and switching that on for them
  // would be a widening nobody asked for.
  const canViewBlackouts = rawAccess.role === 'admin'
    && !recognitionOnly
    && (
      rawAccess.canViewBlackouts === true
      || (
        rawAccess.canViewBlackouts !== false
        && (blackoutsManageable || rawAccess.canEditAttendance === false)
      )
    )

  // Not seeing the calendar means not managing it.
  const canManageBlackouts = blackoutsManageable && canViewBlackouts

  return {
    role: rawAccess.role,
    locationId,
    locationIds,
    displayName: String(rawAccess.displayName || '').trim().slice(0, 80) || null,
    employeeId: String(rawAccess.employeeId || '').trim().slice(0, 80) || null,
    canEditAttendance,
    canViewAttendance,
    canViewTraining,
    canViewBlackouts,
    canViewReports,
    canEditRecognition,
    canManageRecognitionAwards,
    recognitionOnly,
    // Manager notes sit beside the attendance record and are about conduct,
    // not recognition. Somebody who cannot see attendance does not get them.
    canWriteEmployeeNotes: rawAccess.role === 'admin' && canEditAttendance && canViewAttendance && !recognitionOnly,
    canManageRoster,
    canManageBlackouts,
    watermark: rawAccess.watermark === 'localis' ? 'localis' : null,
    ...(rawAccess.credentialFingerprint
      ? { credentialFingerprint: String(rawAccess.credentialFingerprint) }
      : {}),
  }
}

function environmentValue(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || ''
}

function signingSecret() {
  const secret = environmentValue('ATTENDANCE_SESSION_SECRET')
  if (!secret) throw new Error('Attendance session signing is not configured.')
  return secret
}

function signature(value) {
  return createHmac('sha256', signingSecret()).update(value).digest('base64url')
}

function credentialFingerprint(pin) {
  return createHmac('sha256', signingSecret())
    .update(`attendance-pin:${String(pin || '')}`)
    .digest('base64url')
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get('cookie') || '')
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const separator = part.indexOf('=')
        return separator < 0
          ? [part, '']
          : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))]
      })
  )
}

function isLizAdministrator(access, configuredEmployeeId) {
  const displayName = String(access?.displayName || '').trim().toLowerCase()
  const employeeId = String(access?.employeeId || '').trim()
  const lizIdentity = /\b(liz|elizabeth)\b/.test(displayName)
    || (configuredEmployeeId && employeeId === configuredEmployeeId)
  return access?.role === 'admin'
    && access?.canManageRoster !== false
    && access?.canManageBlackouts !== false
    && lizIdentity
}

function withChefAccess(codes) {
  const chefPin = environmentValue('ATTENDANCE_CHEF_PIN').trim()
  if (!chefPin) return { codes, chefApplied: false }

  let problem = ''
  if (!/^\d{4}$/.test(chefPin)) problem = 'invalid-format'
  if (codes[chefPin]) problem = 'pin-conflict'

  // Chef is additive so a bad or conflicting value can never replace an
  // existing production credential.
  if (problem) {
    console.error(JSON.stringify({ event: 'chef-pin-addition-skipped', reason: problem }))
    return { codes, chefApplied: false }
  }

  return { codes: { ...codes, [chefPin]: CHEF_ACCESS }, chefApplied: true }
}

function withPresentationPilotAccess(configuration) {
  const rawPilots = environmentValue('ATTENDANCE_RECOGNITION_PILOT_PINS_JSON').trim()
  if (!rawPilots) return { ...configuration, presentationPilotsApplied: 0 }

  let pilots
  try {
    pilots = JSON.parse(rawPilots)
  } catch {
    console.error(JSON.stringify({ event: 'recognition-pilot-pins-skipped', reason: 'invalid-json' }))
    return { ...configuration, presentationPilotsApplied: 0 }
  }
  if (!pilots || typeof pilots !== 'object' || Array.isArray(pilots)) {
    console.error(JSON.stringify({ event: 'recognition-pilot-pins-skipped', reason: 'invalid-shape' }))
    return { ...configuration, presentationPilotsApplied: 0 }
  }

  const codes = { ...configuration.codes }
  let presentationPilotsApplied = 0
  for (const [pin, rawDisplayName] of Object.entries(pilots)) {
    const displayName = String(rawDisplayName || '').trim().slice(0, 80)
    let problem = ''
    if (!/^\d{4,8}$/.test(pin)) problem = 'invalid-format'
    if (!displayName) problem = 'missing-display-name'
    if (codes[pin]) problem = 'pin-conflict'
    if (problem) {
      console.error(JSON.stringify({ event: 'recognition-pilot-pin-skipped', reason: problem }))
      continue
    }
    codes[pin] = { ...PRESENTATION_PILOT_ACCESS, displayName }
    presentationPilotsApplied += 1
  }
  return { ...configuration, codes, presentationPilotsApplied }
}

// Additional administrators at Liz's level, added without touching
// ATTENDANCE_ACCESS_CODES_JSON — that variable is secret-flagged and cannot be
// read back, so changing one entry means reconstructing all of them from
// memory, and a wrong profile locks somebody out silently.
//
// The capabilities are cloned from Liz's own live entry rather than written
// out here, so the two can never drift apart: whatever her tier means today
// is what a peer gets.
//
// Three deliberate refusals, each logged rather than guessed around:
//   * a PIN already in use is skipped, so this can never replace a working
//     credential — the same rule the chef and pilot additions follow;
//   * `employeeId` is not copied, because it is one of the two things that
//     identify Liz's entry;
//   * a display name that reads as Liz is refused for the same reason. If a
//     peer looked like Liz, ATTENDANCE_LIZ_REPLACEMENT_PIN would find two
//     candidates and stop working.
function withPeerAdministrators(configuration) {
  const raw = environmentValue('ATTENDANCE_PEER_ADMIN_PINS_JSON').trim()
  if (!raw) return { ...configuration, peerAdminsApplied: 0 }

  let peers
  try {
    peers = JSON.parse(raw)
  } catch {
    console.error(JSON.stringify({ event: 'peer-admin-pins-skipped', reason: 'invalid-json' }))
    return { ...configuration, peerAdminsApplied: 0 }
  }
  if (!peers || typeof peers !== 'object' || Array.isArray(peers)) {
    console.error(JSON.stringify({ event: 'peer-admin-pins-skipped', reason: 'invalid-shape' }))
    return { ...configuration, peerAdminsApplied: 0 }
  }

  const configuredEmployeeId = environmentValue('ATTENDANCE_LIZ_EMPLOYEE_ID').trim()
  const template = Object.values(configuration.codes)
    .find(access => isLizAdministrator(access, configuredEmployeeId))
  if (!template) {
    console.error(JSON.stringify({ event: 'peer-admin-pins-skipped', reason: 'no-template' }))
    return { ...configuration, peerAdminsApplied: 0 }
  }

  const codes = { ...configuration.codes }
  let peerAdminsApplied = 0
  for (const [pin, rawDisplayName] of Object.entries(peers)) {
    const displayName = String(rawDisplayName || '').trim().slice(0, 80)
    let problem = ''
    if (!/^\d{4,8}$/.test(pin)) problem = 'invalid-format'
    else if (!displayName) problem = 'missing-display-name'
    else if (codes[pin]) problem = 'pin-conflict'
    else if (/\b(liz|elizabeth)\b/i.test(displayName)) problem = 'name-reads-as-liz'

    if (problem) {
      console.error(JSON.stringify({ event: 'peer-admin-pin-skipped', reason: problem }))
      continue
    }

    const { employeeId: _identifiesLiz, ...capabilities } = template
    codes[pin] = { ...capabilities, displayName }
    peerAdminsApplied += 1
  }

  return { ...configuration, codes, peerAdminsApplied }
}

// Additional district-office logins, added the same additive way and for the
// same reason: ATTENDANCE_ACCESS_CODES_JSON cannot be read back, so an entry
// in it cannot be edited — only the whole set rebuilt from memory.
//
// This is the answer to "that PIN only shows the admin location": rather than
// changing a building login in place, issue one at this tier and retire the
// old one. A PIN already in use is refused and logged, so this can never take
// over a credential somebody is using.
function withLimitedAdministrators(configuration) {
  const raw = environmentValue('ATTENDANCE_LIMITED_ADMIN_PINS_JSON').trim()
  if (!raw) return { ...configuration, limitedAdminsApplied: 0 }

  let entries
  try {
    entries = JSON.parse(raw)
  } catch {
    console.error(JSON.stringify({ event: 'limited-admin-pins-skipped', reason: 'invalid-json' }))
    return { ...configuration, limitedAdminsApplied: 0 }
  }
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
    console.error(JSON.stringify({ event: 'limited-admin-pins-skipped', reason: 'invalid-shape' }))
    return { ...configuration, limitedAdminsApplied: 0 }
  }

  const codes = { ...configuration.codes }
  let limitedAdminsApplied = 0
  for (const [pin, rawDisplayName] of Object.entries(entries)) {
    const displayName = String(rawDisplayName || '').trim().slice(0, 80)
    let problem = ''
    if (!/^[0-9]{4,8}$/.test(pin)) problem = 'invalid-format'
    else if (!displayName) problem = 'missing-display-name'
    else if (codes[pin]) problem = 'pin-conflict'

    if (problem) {
      console.error(JSON.stringify({ event: 'limited-admin-pin-skipped', reason: problem }))
      continue
    }

    codes[pin] = { ...LIMITED_ADMIN_ACCESS, displayName }
    limitedAdminsApplied += 1
  }

  return { ...configuration, codes, limitedAdminsApplied }
}

function accessCodeConfiguration() {
  const rawCodes = environmentValue('ATTENDANCE_ACCESS_CODES_JSON')
  if (!rawCodes) throw new Error('Attendance access codes are not configured.')

  const codes = JSON.parse(rawCodes)
  if (!codes || typeof codes !== 'object' || Array.isArray(codes)) {
    throw new Error('Attendance access codes are invalid.')
  }
  const replacementPin = environmentValue('ATTENDANCE_LIZ_REPLACEMENT_PIN').trim()
  if (!replacementPin) {
    return { ...withLimitedAdministrators(withPeerAdministrators(withPresentationPilotAccess(withChefAccess(codes)))), replacementApplied: false }
  }
  let problem = ''
  if (!/^\d{4,8}$/.test(replacementPin)) {
    problem = 'invalid-format'
  }

  const configuredEmployeeId = environmentValue('ATTENDANCE_LIZ_EMPLOYEE_ID').trim()
  const lizEntries = Object.entries(codes)
    .filter(([, access]) => isLizAdministrator(access, configuredEmployeeId))
  if (lizEntries.length !== 1) problem = 'non-unique-liz-access'

  const [currentPin, lizAccess] = lizEntries[0] || []
  if (currentPin === replacementPin) problem = 'unchanged-pin'
  if (codes[replacementPin] && currentPin !== replacementPin) problem = 'pin-conflict'

  // Preserve the known-good roster when a replacement is misconfigured. The
  // health check remains observable without locking every other user out.
  if (problem) {
    console.error(JSON.stringify({ event: 'liz-pin-replacement-skipped', reason: problem }))
    return { ...withLimitedAdministrators(withPeerAdministrators(withPresentationPilotAccess(withChefAccess(codes)))), replacementApplied: false }
  }

  const replacedCodes = { ...codes }
  delete replacedCodes[currentPin]
  replacedCodes[replacementPin] = lizAccess
  return { ...withLimitedAdministrators(withPeerAdministrators(withPresentationPilotAccess(withChefAccess(replacedCodes)))), replacementApplied: true }
}

export function getAccessCodes() {
  return accessCodeConfiguration().codes
}

export function accessForPin(pin) {
  const candidate = String(pin || '')
  const matchedEntry = Object.entries(getAccessCodes())
    .find(([configuredPin]) => safeEqual(candidate, configuredPin))
  const access = matchedEntry?.[1]
  if (!access) return null
  return normalizeAccessProfile({
    ...access,
    ...(environmentValue('ATTENDANCE_SESSION_SECRET')
      ? { credentialFingerprint: credentialFingerprint(candidate) }
      : {}),
  })
}

// The raw blob entry behind a PIN, before any capability is derived.
// Self-migration stores this rather than the normalized profile, so a flag
// the blob left to be derived stays derived in the table too — writing
// today's derived answer in as an explicit value would freeze it.
function rawAccessForPin(pin) {
  const candidate = String(pin || '')
  const match = Object.entries(getAccessCodes())
    .find(([configuredPin]) => safeEqual(candidate, configuredPin))
  return match?.[1] || null
}

function legacyCodesEnabled() {
  return environmentValue('ATTENDANCE_LEGACY_CODES_ENABLED').trim().toLowerCase() !== 'false'
}

// Sign-in, during the move off the environment blob.
//
// Order matters and is the whole safety argument:
//
//   1. The table. If a PIN is there, that answer wins — Liz may have edited
//      the profile since it migrated, and a stale blob must never override
//      her.
//   2. The blob, exactly as before. On a hit, the credential writes itself
//      into the table, because a successful legacy sign-in is the only
//      moment anybody holds the plaintext PIN.
//
// Self-migration can only ever follow an ALREADY SUCCESSFUL sign-in, so it
// cannot create access that did not exist. Both steps are individually
// switchable: ATTENDANCE_TABLE_AUTH_ENABLED turns off step 1,
// ATTENDANCE_LEGACY_CODES_ENABLED turns off step 2.
export async function resolveAccessForPin(pin, { store: injectedStore = null } = {}) {
  const candidate = String(pin || '')
  const useTable = tableAuthEnabled()
  // Built lazily and only once: constructing it throws when Supabase is
  // unconfigured, which must not happen on the blob-only path.
  let accessStore = injectedStore
  const store = () => (accessStore ||= getAccessStore())

  if (useTable) {
    try {
      console.error(JSON.stringify({ event: 'table-auth-active' }))
      const row = await store().findByPin(candidate)
      if (row) {
        const access = normalizeAccessProfile(profileFromRow(row))
        if (access) {
          // Not awaited: a bookkeeping write must not slow a sign-in, and
          // markUsed already swallows its own failures.
          store().markUsed(row.id)
          // profileId instead of credentialFingerprint — see
          // sessionFromRequest for why the two must not both be present.
          return { ...access, profileId: row.id }
        }
        console.error(JSON.stringify({ event: 'access-profile-unusable', profileId: row.id }))
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: 'table-auth-failed', reason: String(error?.message || error),
      }))
    }
  }

  if (!legacyCodesEnabled()) return null

  const access = accessForPin(candidate)
  if (!access) return null

  if (useTable) {
    try {
      await store().migrateLegacyCredential(candidate, rawAccessForPin(candidate) || access)
    } catch (error) {
      console.error(JSON.stringify({
        event: 'self-migration-failed', reason: String(error?.message || error),
      }))
    }
  }

  return access
}

export function createSessionToken(access, now = Date.now(), sessionId = randomUUID()) {
  const payload = Buffer.from(JSON.stringify({
    ...access,
    sessionId,
    issuedAt: now,
    expiresAt: now + SESSION_DURATION_SECONDS * 1000,
  })).toString('base64url')
  return `${payload}.${signature(payload)}`
}

export function sessionFromRequest(request, now = Date.now()) {
  try {
    const token = parseCookies(request)[SESSION_COOKIE]
    if (!token) return null
    const [payload, suppliedSignature] = token.split('.')
    if (!payload || !suppliedSignature || !safeEqual(signature(payload), suppliedSignature)) return null

    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!session.expiresAt || session.expiresAt <= now) return null
    // A session that came from access_profiles carries profileId and no
    // credentialFingerprint. It must not be re-resolved against the
    // environment blob: the blob does not contain it, the lookup would fail,
    // and the session would be thrown away on its next request. Once the
    // blob is gone entirely, accessCodeConfiguration() throws, so touching
    // it here would log everybody out at once.
    const tableSourced = Boolean(session.profileId) && !session.credentialFingerprint
    const pinConfigurationChanged = !tableSourced && (
      environmentValue('ATTENDANCE_LIZ_REPLACEMENT_PIN')
      || environmentValue('ATTENDANCE_CHEF_PIN')
      || environmentValue('ATTENDANCE_RECOGNITION_PILOT_PINS_JSON')
    )
    const configuration = session.credentialFingerprint || pinConfigurationChanged
      ? accessCodeConfiguration()
      : null
    if (session.credentialFingerprint) {
      const activePin = Object.keys(configuration.codes)
        .find(pin => safeEqual(credentialFingerprint(pin), session.credentialFingerprint))
      if (!activePin) return null
      const currentAccess = accessForPin(activePin)
      if (!currentAccess) return null
      Object.assign(session, currentAccess)
    } else if (configuration?.replacementApplied) {
      const configuredEmployeeId = environmentValue('ATTENDANCE_LIZ_EMPLOYEE_ID').trim()
      if (isLizAdministrator(session, configuredEmployeeId)) return null
    }
    // Older signed sessions did not carry explicit management flags. Treat
    // those missing values as restricted; a current fingerprinted PIN was
    // refreshed above and therefore already has explicit booleans.
    const normalizedAccess = normalizeAccessProfile(session, { defaultAdminManagement: false })
    return normalizedAccess ? { ...session, ...normalizedAccess } : null
  } catch {
    return null
  }
}

export function sessionCookie(token, { secure = true } = {}) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure ? '; Secure' : ''}; SameSite=Strict; Max-Age=${SESSION_DURATION_SECONDS}`
}

export function expiredSessionCookie({ secure = true } = {}) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly${secure ? '; Secure' : ''}; SameSite=Strict; Max-Age=0`
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  })
}
