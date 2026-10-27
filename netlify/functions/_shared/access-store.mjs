// Reading and writing access_profiles.
//
// Follows the same shape as state-store.mjs — plain fetch against the
// Supabase REST API with the service key, no SDK — so there is one way this
// codebase talks to that database rather than two.
//
// Availability choice, deliberate and worth stating: every read here fails
// SOFT. If Supabase is unreachable, findByPin returns null and logs, which
// lets the environment-blob fallback answer instead. During Phases 1 and 2
// that is correct — a database blip must not stop nineteen people marking
// attendance. It stops being correct at Phase 3, when the blob is gone and
// the table is the only answer; that is called out in ACCESS_REDESIGN.md as
// part of the cutover rather than left to be discovered.
import { encryptPin, hasPinKey, pinLengthOf, pinLookup } from './pin-crypto.mjs'

const DEFAULT_DISTRICT_SLUG = 'warren-township'

// A clash with an existing code, as opposed to anything actually broken.
export class ConflictError extends Error {}

const PROFILE_COLUMNS = [
  'id', 'pin_encrypted', 'pin_lookup', 'pin_length', 'username', 'display_name', 'role',
  'location_id', 'employee_id', 'capabilities', 'source', 'disabled_at',
  'last_used_at', 'created_at', 'created_by', 'updated_at', 'updated_by',
].join(',')

function environmentValue(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || ''
}

function logEvent(event, detail = {}) {
  console.error(JSON.stringify({ event, ...detail }))
}

// Which unique index a 409 came from. PostgREST names the constraint in the
// body; if it does not, the PIN is the older and likelier clash.
async function conflictMessage(response) {
  let detail = ''
  try {
    detail = JSON.stringify(await response.clone().json())
  } catch {
    detail = ''
  }
  return detail.includes('username')
    ? 'That username is already in use.'
    : 'That code is already in use.'
}

// A row becomes the same shape the environment blob holds, so
// normalizeAccessProfile keeps being the single place capabilities are
// derived. Anything added to a profile in future is added in one place.
export function profileFromRow(row) {
  if (!row) return null
  const capabilities = row.capabilities && typeof row.capabilities === 'object' && !Array.isArray(row.capabilities)
    ? row.capabilities
    : {}
  return {
    ...capabilities,
    role: row.role,
    displayName: row.display_name,
    ...(row.username ? { username: row.username } : {}),
    ...(row.location_id ? { locationId: row.location_id } : {}),
    ...(row.employee_id ? { employeeId: row.employee_id } : {}),
  }
}

// The inverse, for writing. Only the flags the profile actually carries are
// stored; absent means "let normalizeAccessProfile decide", which is how the
// environment blob behaves today.
export function capabilitiesFromProfile(access) {
  const capabilities = {}
  for (const flag of [
    'canEditAttendance', 'canEditRecognition', 'canManageRecognitionAwards',
    'canManageRoster', 'canManageBlackouts', 'recognitionOnly', 'watermark',
  ]) {
    if (access?.[flag] !== undefined && access?.[flag] !== null) capabilities[flag] = access[flag]
  }
  return capabilities
}

export function createAccessStore({ baseUrl, secretKey, districtSlug, fetchImpl = fetch }) {
  const apiBaseUrl = String(baseUrl || '').replace(/\/+$/, '')
  const tenantSlug = String(districtSlug || DEFAULT_DISTRICT_SLUG)
  if (!apiBaseUrl || !secretKey) throw new Error('Supabase is not configured for access profiles.')

  let districtIdPromise

  function headers(extra = {}) {
    return { apikey: secretKey, Accept: 'application/json', ...extra }
  }

  async function districtId() {
    if (!districtIdPromise) {
      districtIdPromise = (async () => {
        const query = new URLSearchParams({ slug: `eq.${tenantSlug}`, select: 'id', limit: '1' })
        const response = await fetchImpl(`${apiBaseUrl}/rest/v1/districts?${query}`, { headers: headers() })
        if (!response.ok) throw new Error(`Supabase district lookup failed with status ${response.status}.`)
        const rows = await response.json()
        const id = Number(rows?.[0]?.id)
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Supabase district "${tenantSlug}" was not found.`)
        return id
      })()
    }
    return districtIdPromise
  }

  return {
    // Null on no match, on a disabled profile, and on any failure. The caller
    // cannot tell those apart, which is also what we want at sign-in.
    async findByPin(pin) {
      try {
        const id = await districtId()
        const query = new URLSearchParams({
          district_id: `eq.${id}`,
          pin_lookup: `eq.${pinLookup(pin)}`,
          select: PROFILE_COLUMNS,
          limit: '1',
        })
        const response = await fetchImpl(`${apiBaseUrl}/rest/v1/access_profiles?${query}`, { headers: headers() })
        if (!response.ok) throw new Error(`status ${response.status}`)
        const rows = await response.json()
        const row = Array.isArray(rows) ? rows[0] : null
        if (!row) return null
        if (row.disabled_at) {
          logEvent('access-profile-disabled-attempt', { profileId: row.id })
          return null
        }
        return row
      } catch (error) {
        logEvent('access-profile-lookup-failed', { reason: String(error?.message || error) })
        return null
      }
    },

    // Liz, 2026-10-26. Sign-in starts from the person rather than from the
    // digits: find the one profile that answers to this username, then the
    // caller checks the PIN against it.
    //
    // Fails soft like findByPin, and for the same reason — but note the
    // consequence is different. A username sign-in that cannot reach the
    // database returns null and stops, because there is no environment
    // blob holding usernames to fall back to. That is the correct failure:
    // refusing a sign-in beats letting a PIN alone through for an account
    // that is supposed to need two things.
    async findByUsername(username) {
      const wanted = String(username || '').trim().toLowerCase()
      if (!wanted) return null
      try {
        const id = await districtId()
        const query = new URLSearchParams({
          district_id: `eq.${id}`,
          username: `eq.${wanted}`,
          select: PROFILE_COLUMNS,
          limit: '1',
        })
        const response = await fetchImpl(`${apiBaseUrl}/rest/v1/access_profiles?${query}`, { headers: headers() })
        if (!response.ok) throw new Error(`status ${response.status}`)
        const rows = await response.json()
        const row = Array.isArray(rows) ? rows[0] : null
        if (!row) return null
        if (row.disabled_at) {
          logEvent('access-profile-disabled-attempt', { profileId: row.id })
          return null
        }
        return row
      } catch (error) {
        logEvent('access-profile-username-lookup-failed', { reason: String(error?.message || error) })
        return null
      }
    },

    async listProfiles() {
      const id = await districtId()
      const query = new URLSearchParams({
        district_id: `eq.${id}`,
        select: PROFILE_COLUMNS,
        order: 'display_name.asc',
      })
      const response = await fetchImpl(`${apiBaseUrl}/rest/v1/access_profiles?${query}`, { headers: headers() })
      if (!response.ok) throw new Error(`Supabase access profile list failed with status ${response.status}.`)
      const rows = await response.json()
      return Array.isArray(rows) ? rows : []
    },

    // Best-effort: a failure to stamp last_used_at must never fail a sign-in
    // that has already succeeded.
    async markUsed(profileId) {
      try {
        const query = new URLSearchParams({ id: `eq.${profileId}` })
        await fetchImpl(`${apiBaseUrl}/rest/v1/access_profiles?${query}`, {
          method: 'PATCH',
          headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({ last_used_at: new Date().toISOString() }),
        })
      } catch (error) {
        logEvent('access-profile-mark-used-failed', { reason: String(error?.message || error) })
      }
    },

    // Writes a credential that has just proved itself against the
    // environment blob. Returns the row, or null if it could not be written —
    // never throws, because the sign-in it accompanies has already succeeded
    // and must not be undone by a bookkeeping failure.
    async migrateLegacyCredential(pin, access, { actor = 'self-migration' } = {}) {
      try {
        const id = await districtId()
        const row = {
          district_id: id,
          pin_encrypted: encryptPin(pin),
          pin_lookup: pinLookup(pin),
          pin_length: pinLengthOf(pin),
          display_name: String(access?.displayName || '').trim() || 'Unnamed login',
          role: access?.role === 'school' ? 'school' : 'admin',
          location_id: access?.locationId || null,
          employee_id: access?.employeeId || null,
          capabilities: capabilitiesFromProfile(access),
          source: 'legacy',
          // Stamped on insert, because a credential only migrates at the
          // moment somebody successfully signs in with it. Leaving it null
          // until their SECOND sign-in made fifteen live credentials read as
          // "never used" on the day they all migrated — and "never used" is
          // exactly the signal somebody would act on to delete one.
          last_used_at: new Date().toISOString(),
          created_by: actor,
          updated_by: actor,
        }
        // ignore-duplicates, not merge: if the row already exists the table is
        // authoritative and a legacy blob must never overwrite it.
        const response = await fetchImpl(
          `${apiBaseUrl}/rest/v1/access_profiles?on_conflict=district_id,pin_lookup`,
          {
            method: 'POST',
            headers: headers({
              'Content-Type': 'application/json',
              Prefer: 'resolution=ignore-duplicates,return=representation',
            }),
            body: JSON.stringify(row),
          }
        )
        if (!response.ok) throw new Error(`status ${response.status}`)
        const rows = await response.json()
        const created = Array.isArray(rows) ? rows[0] : null
        if (created) {
          logEvent('access-profile-migrated', { profileId: created.id, role: created.role })
          await this.recordChange({ profileId: created.id, event: 'migrated', actor })
        }
        return created || null
      } catch (error) {
        logEvent('access-profile-migration-failed', { reason: String(error?.message || error) })
        return null
      }
    },

    async findById(profileId) {
      const id = await districtId()
      const query = new URLSearchParams({
        district_id: `eq.${id}`,
        id: `eq.${profileId}`,
        select: PROFILE_COLUMNS,
        limit: '1',
      })
      const response = await fetchImpl(`${apiBaseUrl}/rest/v1/access_profiles?${query}`, { headers: headers() })
      if (!response.ok) throw new Error(`Supabase access profile read failed with status ${response.status}.`)
      const rows = await response.json()
      return (Array.isArray(rows) ? rows[0] : null) || null
    },

    async createProfile({ pin, username, displayName, role, locationId, employeeId, capabilities }, { actor = '' } = {}) {
      const id = await districtId()
      const response = await fetchImpl(`${apiBaseUrl}/rest/v1/access_profiles`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({
          district_id: id,
          pin_encrypted: encryptPin(pin),
          pin_lookup: pinLookup(pin),
          pin_length: pinLengthOf(pin),
          username: username || null,
          display_name: displayName,
          role,
          location_id: role === 'school' ? locationId : null,
          employee_id: employeeId || null,
          capabilities: capabilities || {},
          source: 'manual',
          last_used_at: null,
          created_by: actor,
          updated_by: actor,
        }),
      })
      // 23505, on either unique index. Reported without naming whose row
      // it clashed with, but saying which field to change — "already in
      // use" with no clue which box to edit is a dead end.
      if (response.status === 409) throw new ConflictError(await conflictMessage(response))
      if (!response.ok) throw new Error(`Supabase access profile create failed with status ${response.status}.`)
      const rows = await response.json()
      const created = Array.isArray(rows) ? rows[0] : null
      if (created) await this.recordChange({ profileId: created.id, event: 'created', actor })
      return created
    },

    // patch carries only what changed. A new PIN arrives as `pin` and is
    // turned into all three columns here, so no caller ever has to remember
    // that a PIN is stored three ways.
    async updateProfile(profileId, patch, { actor = '', event = 'updated' } = {}) {
      const id = await districtId()
      const body = { updated_at: new Date().toISOString(), updated_by: actor }

      if (patch.pin !== undefined) {
        body.pin_encrypted = encryptPin(patch.pin)
        body.pin_lookup = pinLookup(patch.pin)
        body.pin_length = pinLengthOf(patch.pin)
      }
      // Null clears a username, which returns that login to signing in
      // with its PIN alone. That is the way back if somebody is locked out,
      // so it has to stay possible.
      if (patch.username !== undefined) body.username = patch.username
      if (patch.displayName !== undefined) body.display_name = patch.displayName
      if (patch.role !== undefined) body.role = patch.role
      if (patch.locationId !== undefined) body.location_id = patch.locationId
      // The extra kitchens a manager covers live in capabilities rather
      // than a new column, so this needs no migration: location_id stays
      // the primary and the rest ride alongside the other flags.
      // Null clears the link; a value sets it. Until 2026-10-26 this was
      // only settable when a profile was created, so a login linked to the
      // wrong person could not be corrected.
      if (patch.employeeId !== undefined) body.employee_id = patch.employeeId
      if (patch.capabilities !== undefined) body.capabilities = patch.capabilities
      if (patch.disabledAt !== undefined) body.disabled_at = patch.disabledAt

      const query = new URLSearchParams({ district_id: `eq.${id}`, id: `eq.${profileId}` })
      const response = await fetchImpl(`${apiBaseUrl}/rest/v1/access_profiles?${query}`, {
        method: 'PATCH',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(body),
      })
      if (response.status === 409) throw new ConflictError(await conflictMessage(response))
      if (!response.ok) throw new Error(`Supabase access profile update failed with status ${response.status}.`)
      const rows = await response.json()
      const updated = Array.isArray(rows) ? rows[0] : null
      if (updated) {
        await this.recordChange({
          profileId,
          event,
          // Which fields moved, never their values. A change log that
          // records PINs is a list of PINs.
          detail: { fields: Object.keys(patch) },
          actor,
        })
      }
      return updated
    },

    async recordChange({ profileId = null, event, detail = {}, actor = '' }) {
      try {
        const id = await districtId()
        await fetchImpl(`${apiBaseUrl}/rest/v1/access_changes`, {
          method: 'POST',
          headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
          body: JSON.stringify({
            district_id: id,
            profile_id: profileId,
            event,
            detail,
            actor: String(actor || '').slice(0, 200),
          }),
        })
      } catch (error) {
        logEvent('access-change-log-failed', { reason: String(error?.message || error) })
      }
    },
  }
}

// Whether table-backed access is switched on AND able to work. All three
// have to be true, and a missing key counts as off rather than as an error —
// otherwise setting the flag before the key would take sign-in down.
export function tableAuthEnabled() {
  // Flag absent or off is a deliberate state, so it stays silent. Anything
  // else is a misconfiguration and says so: the first time this was switched
  // on, the only evidence that it had not taken effect was the ABSENCE of a
  // log line, which took three steps to work out. A wrong answer should
  // explain itself.
  const flag = environmentValue('ATTENDANCE_TABLE_AUTH_ENABLED').trim().toLowerCase()
  if (flag !== 'true') return false

  const backend = environmentValue('ATTENDANCE_STATE_BACKEND').trim()
  if (backend !== 'supabase') {
    logEvent('table-auth-disabled', { reason: 'backend-not-supabase', backend: backend || '(unset)' })
    return false
  }
  if (!hasPinKey()) {
    logEvent('table-auth-disabled', { reason: 'missing-pin-key' })
    return false
  }
  return true
}

export function getAccessStore() {
  return createAccessStore({
    baseUrl: environmentValue('SUPABASE_URL'),
    secretKey: environmentValue('SUPABASE_SECRET_KEY'),
    districtSlug: environmentValue('SUPABASE_DISTRICT_SLUG') || DEFAULT_DISTRICT_SLUG,
  })
}
