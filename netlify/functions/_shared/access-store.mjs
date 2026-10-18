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

const PROFILE_COLUMNS = [
  'id', 'pin_encrypted', 'pin_lookup', 'pin_length', 'display_name', 'role',
  'location_id', 'employee_id', 'capabilities', 'source', 'disabled_at',
  'last_used_at', 'created_at', 'created_by', 'updated_at', 'updated_by',
].join(',')

function environmentValue(name) {
  return globalThis.Netlify?.env?.get(name) || process.env[name] || ''
}

function logEvent(event, detail = {}) {
  console.error(JSON.stringify({ event, ...detail }))
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
