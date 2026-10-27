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
import { jsonResponse, normalizeAccessProfile } from './_shared/auth.mjs'
import { validatedSessionFromRequest } from './_shared/server-session.mjs'
import { ConflictError, getAccessStore, profileFromRow, tableAuthEnabled } from './_shared/access-store.mjs'
import {
  GuardError,
  assertNoPrivilegeEscalation,
  normalizeEmployeeLink,
  normalizeExtraLocations,
  assertNotLastAdministrator,
  assertNotSelfLockout,
  assertValidPin,
  assertValidProfileInput,
  normalizeCapabilities,
} from './_shared/access-guards.mjs'
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

// The flags a login actually signs in with, as opposed to the ones written
// down against it.
//
// A profile stores only what was set explicitly; everything else is derived
// at sign-in by normalizeAccessProfile — an administrator who has roster and
// blackout management gets award draws without anybody ticking a box. The
// screen was only ever shown the stored half, so an implicit capability
// looked switched off, and saving the form wrote that lie down. Liz lost
// Employee of the Month that way on 2026-10-19.
//
// Resolved here, through the same function the sign-in path uses, so there
// is no second set of rules to drift.
const CAPABILITY_FLAGS = [
  'canViewAttendance',
  'canViewTraining',
  'canViewBlackouts',
  'canViewReports',
  'canEditAttendance',
  'canEditRecognition',
  'canManageRoster',
  'canManageBlackouts',
  'canManageRecognitionAwards',
]

function effectiveCapabilities(row) {
  const resolved = normalizeAccessProfile(profileFromRow(row)) || {}
  return Object.fromEntries(CAPABILITY_FLAGS.map(flag => [flag, resolved[flag] === true]))
}

// Every building this login covers, primary first.
//
// Reported separately from the capability flags because it is a list, not
// a true/false — and because the screen seeded its "also covers" tick boxes
// from the flag set, which never carried it. The extras therefore never
// loaded back into the form, and the next save wrote an empty list over
// them. Liz, 2026-10-26: "I tested updating some of the manager access to
// include other buildings but they aren't showing up."
function coveredLocations(row) {
  const resolved = normalizeAccessProfile(profileFromRow(row)) || {}
  return Array.isArray(resolved.locationIds) ? resolved.locationIds : []
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
    effectiveCapabilities: effectiveCapabilities(row),
    locationIds: coveredLocations(row),
    source: row.source,
    disabledAt: row.disabled_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

// Every verb goes through this, so there is no path to the store that
// skips the tier check. Returns either a refusal or what to work with.
async function authorize(request, stores) {
  const session = stores.sessions
    ? await validatedSessionFromRequest(request, Date.now(), stores.sessions)
    : await validatedSessionFromRequest(request)
  if (!session) return { refusal: jsonResponse({ error: 'Sign in to continue.' }, 401) }

  // The page hides itself from anyone below this tier, but the page is a
  // convenience. This is the boundary.
  if (!hasLizAdminAccess(session)) {
    console.error(JSON.stringify({
      event: 'access-admin-refused',
      role: session.role,
      displayName: session.displayName,
    }))
    return { refusal: jsonResponse({ error: 'Access management is limited to the district administrator.' }, 403) }
  }

  if (!tableAuthEnabled()) {
    return {
      refusal: jsonResponse({
        error: 'Table-backed access is not switched on for this environment.',
        profiles: [],
      }, 409),
    }
  }

  return { session, store: stores.access || getAccessStore() }
}

// A guard refusal is the caller's mistake and says exactly what was wrong.
// Anything else is ours, and says nothing that would help somebody probing.
function errorResponse(error, event) {
  if (error instanceof GuardError || error instanceof ConflictError) {
    return jsonResponse({ error: error.message }, 409)
  }
  console.error(JSON.stringify({ event, reason: String(error?.message || error) }))
  return jsonResponse({ error: 'That change could not be saved.' }, 502)
}

async function handleList(request, stores) {
  const { refusal, store } = await authorize(request, stores)
  if (refusal) return refusal
  try {
    const rows = await store.listProfiles()
    return jsonResponse({ profiles: rows.map(publicProfile) })
  } catch (error) {
    return errorResponse(error, 'access-admin-list-failed')
  }
}

async function handleCreate(request, stores) {
  const { refusal, session, store } = await authorize(request, stores)
  if (refusal) return refusal

  try {
    const body = await request.json().catch(() => ({}))
    const pin = assertValidPin(body.pin)
    const { displayName, role, locationId } = assertValidProfileInput(body)
    const capabilities = normalizeCapabilities(body.capabilities, { primaryLocationId: locationId })
    assertNoPrivilegeEscalation(session, capabilities)

    const created = await store.createProfile(
      { pin, displayName, role, locationId, employeeId: normalizeEmployeeLink(body.employeeId), capabilities },
      { actor: session.displayName }
    )
    return jsonResponse({ profile: publicProfile(created) }, 201)
  } catch (error) {
    return errorResponse(error, 'access-admin-create-failed')
  }
}

async function handleUpdate(request, stores) {
  const { refusal, session, store } = await authorize(request, stores)
  if (refusal) return refusal

  try {
    const body = await request.json().catch(() => ({}))
    const profileId = String(body.id || '').trim()
    if (!profileId) throw new GuardError('Which login is being changed?')

    const [profile, allProfiles] = await Promise.all([
      store.findById(profileId),
      store.listProfiles(),
    ])
    if (!profile) throw new GuardError('That login no longer exists.')

    const patch = {}
    let event = 'updated'

    if (body.pin !== undefined) {
      patch.pin = assertValidPin(body.pin)
      event = 'pin-changed'
    }
    if (body.employeeId !== undefined) {
      patch.employeeId = normalizeEmployeeLink(body.employeeId)
    }
    if (body.displayName !== undefined || body.role !== undefined || body.locationId !== undefined) {
      const next = assertValidProfileInput({
        displayName: body.displayName ?? profile.display_name,
        role: body.role ?? profile.role,
        locationId: body.locationId ?? profile.location_id,
      })
      patch.displayName = next.displayName
      patch.role = next.role
      patch.locationId = next.locationId
    }
    if (body.capabilities !== undefined) {
      patch.capabilities = normalizeCapabilities(body.capabilities, {
        primaryLocationId: patch.locationId ?? profile.location_id,
      })
      assertNoPrivilegeEscalation(session, patch.capabilities)
    }
    if (body.disabled !== undefined) {
      patch.disabledAt = body.disabled ? new Date().toISOString() : null
      event = body.disabled ? 'disabled' : 'enabled'
    }
    if (!Object.keys(patch).length) throw new GuardError('Nothing to change.')

    const change = {
      disabling: body.disabled === true,
      capabilities: patch.capabilities,
      role: patch.role,
    }
    assertNotSelfLockout(session, profile, change)
    assertNotLastAdministrator(allProfiles, profile, change)

    const updated = await store.updateProfile(profileId, patch, { actor: session.displayName, event })
    if (!updated) throw new GuardError('That login no longer exists.')
    return jsonResponse({ profile: publicProfile(updated) })
  } catch (error) {
    return errorResponse(error, 'access-admin-update-failed')
  }
}

// stores is injected by the tests only; Netlify calls handler(request, context).
export default async function handler(request, context = {}, stores = {}) {
  const requestId = randomUUID()
  const startedAt = Date.now()

  const response = request.method === 'GET'
    ? await handleList(request, stores)
    : request.method === 'POST'
      ? await handleCreate(request, stores)
      : request.method === 'PATCH'
        ? await handleUpdate(request, stores)
        // No hard delete. A login that is no longer wanted is disabled,
        // which is reversible and keeps its history; deleting one throws
        // away the record of what it was able to reach.
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
