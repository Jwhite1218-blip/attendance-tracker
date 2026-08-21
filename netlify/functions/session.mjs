import { createHash } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import {
  accessForPin,
  createSessionToken,
  expiredSessionCookie,
  jsonResponse,
  sessionCookie,
  sessionFromRequest,
} from './_shared/auth.mjs'

const MAX_FAILED_ATTEMPTS = 20
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

function publicAccess(session) {
  return {
    role: session.role,
    locationId: session.locationId || null,
    displayName: session.displayName || null,
    employeeId: session.employeeId || null,
    canEditAttendance: (session.role === 'admin' || session.role === 'school') && session.canEditAttendance !== false,
    canManageRoster: session.role === 'admin' && session.canManageRoster === true,
    canManageBlackouts: session.role === 'admin' && session.canManageBlackouts === true,
    watermark: session.watermark === 'localis' ? 'localis' : null,
  }
}

function rateLimitKey(ip) {
  return createHash('sha256').update(ip || 'unknown').digest('hex')
}

async function handleLogin(request, context) {
  const rateStore = getStore({ name: 'attendance-auth-rate-limits', consistency: 'strong' })
  const key = rateLimitKey(context.ip)
  const now = Date.now()
  const current = await rateStore.get(key, { type: 'json' })
  const attempts = current && now - current.startedAt < RATE_LIMIT_WINDOW_MS
    ? current
    : { count: 0, startedAt: now }

  if (attempts.count >= MAX_FAILED_ATTEMPTS) {
    return jsonResponse({ error: 'Too many incorrect attempts. Please wait 15 minutes and try again.' }, 429)
  }

  const parsedBody = await request.json().catch(() => null)
  const body = parsedBody && typeof parsedBody === 'object' && !Array.isArray(parsedBody) ? parsedBody : {}
  const pin = String(body.pin || '').trim()
  let access = null
  let token = null
  try {
    if (/^\d{4,8}$/.test(pin)) access = accessForPin(pin)
    if (access) token = createSessionToken(access, now)
  } catch {
    return jsonResponse({ error: 'Secure login is temporarily unavailable.' }, 503)
  }

  if (!access) {
    await rateStore.setJSON(key, { count: attempts.count + 1, startedAt: attempts.startedAt })
    return jsonResponse({ error: 'Invalid PIN. Please try again.' }, 401)
  }

  await rateStore.delete(key)
  const secure = new URL(request.url).protocol === 'https:'
  return jsonResponse(
    { access: publicAccess(access) },
    200,
    { 'Set-Cookie': sessionCookie(token, { secure }) }
  )
}

export default async (request, context) => {
  if (request.method === 'POST') return handleLogin(request, context)

  if (request.method === 'DELETE') {
    const secure = new URL(request.url).protocol === 'https:'
    return jsonResponse({ ok: true }, 200, { 'Set-Cookie': expiredSessionCookie({ secure }) })
  }

  if (request.method === 'GET') {
    const session = sessionFromRequest(request)
    if (!session) return jsonResponse({ error: 'Authentication required.' }, 401)
    return jsonResponse({ access: publicAccess(session) })
  }

  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, DELETE' })
}

export const config = {
  path: '/api/session',
}
