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

export function getAccessCodes() {
  const rawCodes = environmentValue('ATTENDANCE_ACCESS_CODES_JSON')
  if (!rawCodes) throw new Error('Attendance access codes are not configured.')

  const codes = JSON.parse(rawCodes)
  if (!codes || typeof codes !== 'object' || Array.isArray(codes)) {
    throw new Error('Attendance access codes are invalid.')
  }
  return codes
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
    canManageRoster: access.role === 'admin' && access.canManageRoster !== false,
    canManageBlackouts: access.role === 'admin' && access.canManageBlackouts !== false,
    watermark: access.watermark === 'localis' ? 'localis' : null,
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
