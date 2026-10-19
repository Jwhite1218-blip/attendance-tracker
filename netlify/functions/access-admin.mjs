// Who has access, and what their PIN is.
//
// Read-only for now, deliberately. The list is shipped on its own so Liz and
// Jon can look at nineteen real migrated rows and say "that is wrong" before
// anything can modify them. Write operations come next, with the guardrails.
//
// This is the only place a PIN is ever decrypted and sent anywhere. That is
// the point of encrypting rather than hashing — "what is Creston's code?"
// should be answered by looking, not by reissuing. It is gated three ways:
// a valid server session, Liz's tier, and HTTPS in production.
import { randomUUID } from 'node:crypto'
import { hasLizAdminAccess } from '../../src/data/futureTools.js'
import { jsonResponse } from './_shared/auth.mjs'
import { validatedSessionFromRequest } from './_shared/server-session.mjs'
import { getAccessStore, tableAuthEnabled } from './_shared/access-store.mjs'
import { decryptPin } from './_shared/pin-crypto.mjs'

// A row with an unreadable PIN is still a real credential and must still be
// listed — it simply cannot show the number. Silently dropping it would hide
// access from the one screen whose job is to show all of it.
function safePin(row) {
  try {
    return { pin: decryptPin(row.pin_encrypted), pinReadable: true }
  } catch {
    return { pin: null, pinReadable: false }
  }
}

export function publicProfile(row) {
  const { pin, pinReadable } = safePin(row)
  return {
    id: row.id,
    pin,
    pinReadable,
    pinLength: row.pin_length,
    displayName: row.display_name,
    role: row.role,
    locationId: row.location_id,
    employeeId: row.employee_id,
    capabilities: row.capabilities || {},
    source: row.source,
    disabledAt: row.disabled_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

async function handleList(request, stores) {
  const session = stores.sessions
    ? await validatedSessionFromRequest(request, Date.now(), stores.sessions)
    : await validatedSessionFromRequest(request)
  if (!session) return jsonResponse({ error: 'Sign in to continue.' }, 401)

  // The same bar the page enforces, enforced again here. The page is a
  // convenience; this is the boundary.
  if (!hasLizAdminAccess(session)) {
    console.error(JSON.stringify({
      event: 'access-admin-refused',
      role: session.role,
      displayName: session.displayName,
    }))
    return jsonResponse({ error: 'Access management is limited to the district administrator.' }, 403)
  }

  if (!tableAuthEnabled()) {
    return jsonResponse({
      error: 'Table-backed access is not switched on for this environment.',
      profiles: [],
    }, 409)
  }

  try {
    const rows = await (stores.access || getAccessStore()).listProfiles()
    return jsonResponse({ profiles: rows.map(publicProfile) })
  } catch (error) {
    console.error(JSON.stringify({
      event: 'access-admin-list-failed',
      reason: String(error?.message || error),
    }))
    return jsonResponse({ error: 'Could not load access profiles.' }, 502)
  }
}

// stores is injected by the tests only; Netlify calls handler(request, context).
export default async function handler(request, context = {}, stores = {}) {
  const requestId = randomUUID()
  const startedAt = Date.now()

  const response = request.method === 'GET'
    ? await handleList(request, stores)
    : jsonResponse({ error: 'Method not allowed.' }, 405)

  // Deliberately logs that the list was read and by whom, but never what it
  // contained. This endpoint returns every PIN in the district.
  console.error(JSON.stringify({
    event: 'access-admin-request',
    requestId,
    method: request.method,
    status: response.status,
    durationMs: Date.now() - startedAt,
  }))
  return response
}

export const config = {
  path: '/api/access-admin',
}
