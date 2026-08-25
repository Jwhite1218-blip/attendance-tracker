import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'attendance-session'
const SESSION_DURATION_SECONDS = 8 * 60 * 60

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

function accessCodeConfiguration() {
  const rawCodes = environmentValue('ATTENDANCE_ACCESS_CODES_JSON')
  if (!rawCodes) throw new Error('Attendance access codes are not configured.')

  const codes = JSON.parse(rawCodes)
  if (!codes || typeof codes !== 'object' || Array.isArray(codes)) {
    throw new Error('Attendance access codes are invalid.')
  }
  const replacementPin = environmentValue('ATTENDANCE_LIZ_REPLACEMENT_PIN').trim()
  if (!replacementPin) return { codes, replacementApplied: false }
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
    return { codes, replacementApplied: false }
  }

  const replacedCodes = { ...codes }
  delete replacedCodes[currentPin]
  replacedCodes[replacementPin] = lizAccess
  return { codes: replacedCodes, replacementApplied: true }
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

  return {
    role: access.role,
    locationId: access.locationId || null,
    displayName: access.displayName || null,
    employeeId: access.employeeId || null,
    canEditAttendance: (access.role === 'admin' || access.role === 'school') && access.canEditAttendance !== false,
    canWriteEmployeeNotes: access.role === 'admin' && access.canEditAttendance !== false,
    canManageRoster: access.role === 'admin' && access.canManageRoster !== false,
    canManageBlackouts: access.role === 'admin' && access.canManageBlackouts !== false,
    watermark: access.watermark === 'localis' ? 'localis' : null,
    ...(environmentValue('ATTENDANCE_SESSION_SECRET')
      ? { credentialFingerprint: credentialFingerprint(candidate) }
      : {}),
  }
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
    const configuration = session.credentialFingerprint || environmentValue('ATTENDANCE_LIZ_REPLACEMENT_PIN')
      ? accessCodeConfiguration()
      : null
    if (session.credentialFingerprint) {
      const activeFingerprints = Object.keys(configuration.codes).map(credentialFingerprint)
      if (!activeFingerprints.some(fingerprint => safeEqual(fingerprint, session.credentialFingerprint))) return null
    } else if (configuration?.replacementApplied) {
      const configuredEmployeeId = environmentValue('ATTENDANCE_LIZ_EMPLOYEE_ID').trim()
      if (isLizAdministrator(session, configuredEmployeeId)) return null
    }
    return session
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
