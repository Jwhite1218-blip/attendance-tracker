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

  const locationId = rawAccess.role === 'school'
    ? normalizeSchoolLocationId(rawAccess.locationId)
    : null
  if (rawAccess.role === 'school' && !locationId) return null
  if (rawAccess.role === 'school' && rawAccess.recognitionOnly === true) return null

  const recognitionOnly = rawAccess.role === 'admin' && rawAccess.recognitionOnly === true
  const canEditAttendance = !recognitionOnly && rawAccess.canEditAttendance !== false
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
  const canManageBlackouts = rawAccess.role === 'admin'
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
        && canManageBlackouts
      )
    )

  return {
    role: rawAccess.role,
    locationId,
    displayName: String(rawAccess.displayName || '').trim().slice(0, 80) || null,
    employeeId: String(rawAccess.employeeId || '').trim().slice(0, 80) || null,
    canEditAttendance,
    canEditRecognition,
    canManageRecognitionAwards,
    recognitionOnly,
    canWriteEmployeeNotes: rawAccess.role === 'admin' && canEditAttendance && !recognitionOnly,
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

function accessCodeConfiguration() {
  const rawCodes = environmentValue('ATTENDANCE_ACCESS_CODES_JSON')
  if (!rawCodes) throw new Error('Attendance access codes are not configured.')

  const codes = JSON.parse(rawCodes)
  if (!codes || typeof codes !== 'object' || Array.isArray(codes)) {
    throw new Error('Attendance access codes are invalid.')
  }
  const replacementPin = environmentValue('ATTENDANCE_LIZ_REPLACEMENT_PIN').trim()
  if (!replacementPin) {
    return { ...withPresentationPilotAccess(withChefAccess(codes)), replacementApplied: false }
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
    return { ...withPresentationPilotAccess(withChefAccess(codes)), replacementApplied: false }
  }

  const replacedCodes = { ...codes }
  delete replacedCodes[currentPin]
  replacedCodes[replacementPin] = lizAccess
  return { ...withPresentationPilotAccess(withChefAccess(replacedCodes)), replacementApplied: true }
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
    const pinConfigurationChanged = environmentValue('ATTENDANCE_LIZ_REPLACEMENT_PIN')
      || environmentValue('ATTENDANCE_CHEF_PIN')
      || environmentValue('ATTENDANCE_RECOGNITION_PILOT_PINS_JSON')
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
