import { createHash, randomUUID } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import {
  SESSION_COOKIE,
  accessForPin,
  createSessionToken,
  expiredSessionCookie,
  jsonResponse,
  sessionCookie,
  sessionFromRequest,
} from './_shared/auth.mjs'
import { updateBlobJSON } from './_shared/blob-json.mjs'
import {
  getServerSessionStore,
  registerServerSession,
  revokeServerSession,
  validatedSessionFromRequest,
} from './_shared/server-session.mjs'

const MAX_PIN_FAILURES = 5
const MAX_IP_ATTEMPTS = 100
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

function publicAccess(session) {
  const eligibleManager = session.role === 'admin' || session.role === 'school'
  const canEditRecognition = eligibleManager && (
    session.canEditRecognition === true
    || (session.canEditRecognition === undefined && session.canEditAttendance !== false)
  )
  return {
    role: session.role,
    locationId: session.locationId || null,
    displayName: session.displayName || null,
    employeeId: session.employeeId || null,
    canEditAttendance: (session.role === 'admin' || session.role === 'school') && session.canEditAttendance !== false,
    canEditRecognition,
    canManageRecognitionAwards: session.role === 'admin'
      && canEditRecognition
      && session.recognitionOnly !== true
      && session.canManageRecognitionAwards !== false,
    recognitionOnly: session.recognitionOnly === true,
    canWriteEmployeeNotes: session.role === 'admin'
      && session.canEditAttendance !== false
      && session.recognitionOnly !== true,
    canManageRoster: session.role === 'admin' && session.canManageRoster === true,
    canManageBlackouts: session.role === 'admin' && session.canManageBlackouts === true,
    watermark: session.watermark === 'localis' ? 'localis' : null,
  }
}

function hashKey(value) {
  return createHash('sha256').update(String(value || 'unknown')).digest('hex')
}

function rateLimitKeys(ip, pin) {
  const ipHash = hashKey(ip)
  return {
    ip: `ip-${ipHash}`,
    pin: `pin-${ipHash}-${hashKey(pin)}`,
  }
}

async function reserveAttempt(store, key, now, maximum) {
  const state = await updateBlobJSON(store, key, current => {
    const active = current && now - Number(current.startedAt) < RATE_LIMIT_WINDOW_MS
      ? current
      : { count: 0, startedAt: now }
    return { count: Number(active.count || 0) + 1, startedAt: active.startedAt }
  })
  return { state, limited: state.count > maximum }
}

function limitedResponse() {
  return jsonResponse(
    { error: 'Too many incorrect attempts. Please wait 15 minutes and try again.' },
    429,
    { 'Retry-After': String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)) }
  )
}

async function handleLogin(request, context, stores) {
  const parsedBody = await request.json().catch(() => null)
  const body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody) ? parsedBody : {}
  const pin = String(body.pin || '').trim()
  const now = Date.now()
  const keys = rateLimitKeys(context.ip, pin)

  const ipAttempt = await reserveAttempt(stores.rate, keys.ip, now, MAX_IP_ATTEMPTS)
  if (ipAttempt.limited) return limitedResponse()

  let access = null
  try {
    if (/^\d{4,8}$/.test(pin)) access = accessForPin(pin)
  } catch {
    return jsonResponse({ error: 'Secure login is temporarily unavailable.' }, 503)
  }

  if (!access) {
    const pinAttempt = await reserveAttempt(stores.rate, keys.pin, now, MAX_PIN_FAILURES)
    if (pinAttempt.limited) return limitedResponse()
    return jsonResponse({ error: 'Invalid PIN. Please try again.' }, 401)
  }

  await Promise.all([
    stores.rate.delete(keys.ip),
    stores.rate.delete(keys.pin),
  ])

  const token = createSessionToken(access, now)
  const session = sessionFromRequest(new Request(request.url, {
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
  }), now)
  await registerServerSession(session, stores.sessions)

  const secure = new URL(request.url).protocol === 'https:'
  return jsonResponse(
    { access: publicAccess(access) },
    200,
    { 'Set-Cookie': sessionCookie(token, { secure }) }
  )
}

export async function handleSessionRequest(request, context = {}, stores = {}) {
  const selectedStores = {
    rate: stores.rate || getStore({ name: 'attendance-auth-rate-limits', consistency: 'strong' }),
    sessions: stores.sessions || getServerSessionStore(),
  }

  if (request.method === 'POST') return handleLogin(request, context, selectedStores)

  if (request.method === 'DELETE') {
    await revokeServerSession(sessionFromRequest(request), selectedStores.sessions)
    const secure = new URL(request.url).protocol === 'https:'
    return jsonResponse({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie({ secure }) })
  }

  if (request.method === 'GET') {
    const session = await validatedSessionFromRequest(request, Date.now(), selectedStores.sessions)
    if (!session) return jsonResponse({ error: 'Authentication required.' }, 401)
    return jsonResponse({ access: publicAccess(session) })
  }

  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, DELETE' })
}

export default async (request, context) => {
  const startedAt = Date.now()
  const requestId = context?.requestId || randomUUID()
  let response
  try {
    response = await handleSessionRequest(request, context)
  } catch (error) {
    console.error(JSON.stringify({ event: 'session-error', requestId, message: error.message }))
    response = jsonResponse({ error: 'The authentication service is temporarily unavailable.', requestId }, 503)
  }
  response.headers.set('X-Request-ID', requestId)
  console.log(JSON.stringify({
    event: 'session-request',
    requestId,
    method: request.method,
    status: response.status,
    durationMs: Date.now() - startedAt,
  }))
  return response
}

export const config = {
  path: '/api/session',
}
