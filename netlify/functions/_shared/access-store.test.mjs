import test from 'node:test'
import assert from 'node:assert/strict'
import {
  capabilitiesFromProfile,
  createAccessStore,
  profileFromRow,
  tableAuthEnabled,
} from './access-store.mjs'
import { decryptPin, pinLookup } from './pin-crypto.mjs'
import { normalizeAccessProfile } from './auth.mjs'

const KEY = 'c'.repeat(64)

// Set for the whole file: the helpers below compute lookup values, which
// need a key. Tests that care about a missing key unset it via withEnv.
process.env.ATTENDANCE_PIN_KEY = KEY

function withEnv(values, run) {
  const saved = {}
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return run()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

// A stand-in for PostgREST that records what it was asked for, so the tests
// assert on the request as well as the result.
function fakeSupabase({ profiles = [], failOn = null } = {}) {
  const calls = []
  const rows = [...profiles]
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body, headers: options.headers || {} })
    const target = String(url)
    if (failOn && target.includes(failOn)) return { ok: false, status: 500, json: async () => ({}) }

    if (target.includes('/districts?')) {
      return { ok: true, status: 200, json: async () => [{ id: 7 }] }
    }
    if (target.includes('/access_profiles?') && (options.method || 'GET') === 'GET') {
      const match = target.match(/pin_lookup=eq\.([^&]+)/)
      const found = match
        ? rows.filter(row => row.pin_lookup === decodeURIComponent(match[1]))
        : rows
      return { ok: true, status: 200, json: async () => found }
    }
    if (target.includes('/access_profiles') && options.method === 'POST') {
      const row = { id: 'new-id', ...JSON.parse(options.body) }
      const clash = rows.some(existing => existing.pin_lookup === row.pin_lookup)
      if (clash) return { ok: true, status: 201, json: async () => [] }
      rows.push(row)
      return { ok: true, status: 201, json: async () => [row] }
    }
    if (target.includes('/access_profiles') && options.method === 'PATCH') {
      return { ok: true, status: 204, json: async () => [] }
    }
    if (target.includes('/access_changes')) {
      return { ok: true, status: 201, json: async () => [] }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  }
  return { fetchImpl, calls, rows }
}

function store(fake) {
  return createAccessStore({
    baseUrl: 'https://example.supabase.co',
    secretKey: 'service-key',
    districtSlug: 'warren-township',
    fetchImpl: fake.fetchImpl,
  })
}

function schoolRow(pin, overrides = {}) {
  return {
    id: 'row-1',
    pin_lookup: pinLookup(pin),
    pin_encrypted: 'ignored-here',
    pin_length: pin.length,
    display_name: 'Creston Manager',
    role: 'school',
    location_id: 'CrestonMS',
    employee_id: null,
    capabilities: { canEditAttendance: true },
    source: 'manual',
    disabled_at: null,
    ...overrides,
  }
}

test('a stored row becomes the same profile shape the environment blob holds', () => {
  const profile = profileFromRow(schoolRow('1742'))
  assert.deepEqual(profile, {
    canEditAttendance: true,
    role: 'school',
    displayName: 'Creston Manager',
    locationId: 'CrestonMS',
  })
  // And it survives the same derivation the blob profiles go through.
  const normalized = normalizeAccessProfile(profile)
  assert.equal(normalized.role, 'school')
  assert.equal(normalized.locationId, 'CrestonMS')
  assert.equal(normalized.canManageRoster, false)
  assert.equal(profileFromRow(null), null)
})

test('a row with no capabilities object does not crash the mapping', () => {
  assert.equal(profileFromRow(schoolRow('1742', { capabilities: null })).role, 'school')
  assert.equal(profileFromRow(schoolRow('1742', { capabilities: ['nope'] })).role, 'school')
})

test('only flags the profile actually carries are stored', () => {
  assert.deepEqual(
    capabilitiesFromProfile({ role: 'admin', displayName: 'Liz', canManageRoster: true, canManageBlackouts: true }),
    { canManageRoster: true, canManageBlackouts: true }
  )
  assert.deepEqual(capabilitiesFromProfile({ role: 'admin' }), {}, 'absent means let the deriver decide')
  assert.deepEqual(capabilitiesFromProfile({ canEditAttendance: false }), { canEditAttendance: false },
    'false is a decision and is kept')
})

test('a PIN is found by its lookup value, in one query', async () => {
  await withEnv({ ATTENDANCE_PIN_KEY: KEY }, async () => {
    const fake = fakeSupabase({ profiles: [schoolRow('1742')] })
    const row = await store(fake).findByPin('1742')
    assert.equal(row.display_name, 'Creston Manager')
    const profileCalls = fake.calls.filter(call => call.url.includes('/access_profiles?'))
    assert.equal(profileCalls.length, 1, 'one lookup regardless of how many profiles exist')
    assert.ok(profileCalls[0].url.includes('pin_lookup=eq.'), 'matched on the deterministic column')
    assert.ok(!profileCalls[0].url.includes('1742'), 'the PIN itself never reaches the query string')
  })
})

test('a wrong PIN finds nothing', async () => {
  await withEnv({ ATTENDANCE_PIN_KEY: KEY }, async () => {
    const fake = fakeSupabase({ profiles: [schoolRow('1742')] })
    assert.equal(await store(fake).findByPin('1743'), null)
  })
})

// A disabled profile must be indistinguishable from a wrong PIN.
test('a disabled profile does not sign in', async () => {
  await withEnv({ ATTENDANCE_PIN_KEY: KEY }, async () => {
    const fake = fakeSupabase({ profiles: [schoolRow('1742', { disabled_at: '2026-10-01T00:00:00Z' })] })
    assert.equal(await store(fake).findByPin('1742'), null)
  })
})

// The availability choice, asserted so it cannot be changed by accident.
test('a database failure returns nothing rather than throwing, so the blob can answer', async () => {
  await withEnv({ ATTENDANCE_PIN_KEY: KEY }, async () => {
    const fake = fakeSupabase({ profiles: [schoolRow('1742')], failOn: '/access_profiles?' })
    assert.equal(await store(fake).findByPin('1742'), null)
  })
})

test('a legacy credential migrates itself, encrypted, with its capabilities', async () => {
  await withEnv({ ATTENDANCE_PIN_KEY: KEY }, async () => {
    const fake = fakeSupabase()
    const created = await store(fake).migrateLegacyCredential('1742', {
      role: 'school',
      displayName: 'Creston Manager',
      locationId: 'CrestonMS',
      canEditAttendance: true,
    })
    assert.ok(created)
    assert.equal(created.source, 'legacy')
    assert.equal(created.pin_length, 4)
    assert.equal(decryptPin(created.pin_encrypted), '1742', 'recoverable, so Liz can look it up')
    assert.equal(created.pin_lookup, pinLookup('1742'))
    assert.deepEqual(created.capabilities, { canEditAttendance: true })
    assert.ok(fake.calls.some(call => call.url.includes('/access_changes')), 'the migration is logged')
  })
})

// The table is authoritative. A stale environment blob must never overwrite
// a profile Liz has since edited.
test('migrating a PIN that is already in the table changes nothing', async () => {
  await withEnv({ ATTENDANCE_PIN_KEY: KEY }, async () => {
    const existing = schoolRow('1742', { display_name: 'Edited By Liz' })
    const fake = fakeSupabase({ profiles: [existing] })
    const result = await store(fake).migrateLegacyCredential('1742', {
      role: 'school', displayName: 'Stale Blob Name', locationId: 'CrestonMS',
    })
    assert.equal(result, null, 'nothing written')
    assert.equal(fake.rows.length, 1)
    assert.equal(fake.rows[0].display_name, 'Edited By Liz')
    const post = fake.calls.find(call => call.method === 'POST' && call.url.includes('access_profiles'))
    assert.ok(post.url.includes('on_conflict=district_id,pin_lookup'), 'conflict target named')
    assert.match(String(post.headers.Prefer), /resolution=ignore-duplicates/,
      'ignore, never merge: the table wins over a stale blob')
  })
})

test('a failed migration does not throw, because the sign-in already succeeded', async () => {
  await withEnv({ ATTENDANCE_PIN_KEY: KEY }, async () => {
    const fake = fakeSupabase({ failOn: '/access_profiles' })
    const result = await store(fake).migrateLegacyCredential('1742', { role: 'admin', displayName: 'Liz' })
    assert.equal(result, null)
  })
})

test('a failure stamping last used does not surface', async () => {
  await withEnv({ ATTENDANCE_PIN_KEY: KEY }, async () => {
    const fake = fakeSupabase({ failOn: '/access_profiles' })
    await assert.doesNotReject(() => store(fake).markUsed('row-1'))
  })
})

test('the store refuses to exist without Supabase configured', () => {
  assert.throws(() => createAccessStore({ baseUrl: '', secretKey: 'k' }), /not configured/)
  assert.throws(() => createAccessStore({ baseUrl: 'https://x', secretKey: '' }), /not configured/)
})

// Three independent conditions, each of which must hold.
test('table auth is off unless the flag, the backend and the key all agree', () => {
  const on = {
    ATTENDANCE_TABLE_AUTH_ENABLED: 'true',
    ATTENDANCE_STATE_BACKEND: 'supabase',
    ATTENDANCE_PIN_KEY: KEY,
  }
  withEnv(on, () => assert.equal(tableAuthEnabled(), true))
  withEnv({ ...on, ATTENDANCE_TABLE_AUTH_ENABLED: 'false' }, () => assert.equal(tableAuthEnabled(), false))
  withEnv({ ...on, ATTENDANCE_TABLE_AUTH_ENABLED: undefined }, () => assert.equal(tableAuthEnabled(), false))
  withEnv({ ...on, ATTENDANCE_STATE_BACKEND: 'blobs' }, () => assert.equal(tableAuthEnabled(), false))
  // Setting the flag before the key must not take sign-in down.
  withEnv({ ...on, ATTENDANCE_PIN_KEY: undefined }, () => assert.equal(tableAuthEnabled(), false))
  withEnv({ ...on, ATTENDANCE_PIN_KEY: 'too-short' }, () => assert.equal(tableAuthEnabled(), false))
})
