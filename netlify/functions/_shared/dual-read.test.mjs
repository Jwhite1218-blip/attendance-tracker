// Sign-in during the move off the environment blob.
//
// Everything here is about the order of the two sources and what happens at
// the seams. The failure modes are all silent — a stale blob quietly winning
// over an edit Liz made, a migrated session being thrown away on its next
// request — so each one gets a test that would catch it.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SESSION_COOKIE,
  createSessionToken,
  resolveAccessForPin,
  sessionFromRequest,
} from './auth.mjs'
import { profileFromRow } from './access-store.mjs'
import { pinLookup } from './pin-crypto.mjs'

const KEY = 'd'.repeat(64)
process.env.ATTENDANCE_PIN_KEY = KEY

const BLOB_CODES = {
  1111: {
    role: 'admin',
    displayName: 'Liz Administrator',
    employeeId: 'emp-liz00001',
    canEditAttendance: true,
    canManageRoster: true,
    canManageBlackouts: true,
  },
  2222: {
    role: 'school',
    displayName: 'Creston Manager',
    locationId: 'CrestonMS',
    canEditAttendance: true,
  },
}

const TABLE_ON = {
  ATTENDANCE_ACCESS_CODES_JSON: JSON.stringify(BLOB_CODES),
  ATTENDANCE_SESSION_SECRET: 'test-secret',
  ATTENDANCE_PIN_KEY: KEY,
  ATTENDANCE_TABLE_AUTH_ENABLED: 'true',
  ATTENDANCE_STATE_BACKEND: 'supabase',
  ATTENDANCE_LEGACY_CODES_ENABLED: undefined,
  ATTENDANCE_CHEF_PIN: undefined,
  ATTENDANCE_RECOGNITION_PILOT_PINS_JSON: undefined,
  ATTENDANCE_PEER_ADMIN_PINS_JSON: undefined,
  ATTENDANCE_LIMITED_ADMIN_PINS_JSON: undefined,
  ATTENDANCE_LIZ_REPLACEMENT_PIN: undefined,
}

async function withEnv(values, run) {
  const saved = {}
  for (const [key, value] of Object.entries(values)) {
    saved[key] = process.env[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  try {
    return await run()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

function fakeStore({ rows = [], findThrows = false } = {}) {
  const calls = { find: 0, migrated: [], marked: [] }
  return {
    calls,
    async findByPin(pin) {
      calls.find += 1
      if (findThrows) throw new Error('supabase unreachable')
      return rows.find(row => row.pin_lookup === pinLookup(pin)) || null
    },
    async findByUsername(username) {
      calls.findByUsername = (calls.findByUsername || 0) + 1
      if (findThrows) throw new Error('supabase unreachable')
      const wanted = String(username || '').toLowerCase()
      return rows.find(row => String(row.username || '').toLowerCase() === wanted) || null
    },
    markUsed(id) { calls.marked.push(id) },
    async migrateLegacyCredential(pin, access) {
      calls.migrated.push({ pin, access })
      return { id: 'migrated-id' }
    },
  }
}

function tableRow(pin, overrides = {}) {
  return {
    id: 'profile-1',
    pin_lookup: pinLookup(pin),
    display_name: 'Creston Manager (edited)',
    role: 'school',
    location_id: 'CrestonMS',
    employee_id: null,
    capabilities: { canEditAttendance: true },
    disabled_at: null,
    ...overrides,
  }
}

// The central rule. Liz edits a profile; the blob still holds the old one.
test('the table wins over the blob for the same PIN', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [tableRow('2222')] })
    const access = await resolveAccessForPin('2222', { store })
    assert.equal(access.displayName, 'Creston Manager (edited)')
    assert.equal(store.calls.migrated.length, 0, 'nothing migrates when the table already answered')
    assert.deepEqual(store.calls.marked, ['profile-1'], 'last used is stamped')
  })
})

test('a PIN only in the blob still signs in, and migrates itself', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [] })
    const access = await resolveAccessForPin('2222', { store })
    assert.equal(access.displayName, 'Creston Manager')
    assert.equal(store.calls.migrated.length, 1)
    assert.equal(store.calls.migrated[0].pin, '2222')
  })
})

// The raw blob entry is migrated, not the derived one: writing today's
// derived answer in as an explicit value would freeze it forever.
test('migration stores the blob entry as written, not the derived profile', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [] })
    await resolveAccessForPin('2222', { store })
    const migrated = store.calls.migrated[0].access
    assert.equal(migrated.canEditAttendance, true, 'what the blob said')
    assert.equal('canManageRoster' in migrated, false, 'what the blob left to be derived stays derived')
  })
})

// Self-migration must never be able to invent access.
test('a PIN in neither place yields nothing and migrates nothing', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [] })
    assert.equal(await resolveAccessForPin('9999', { store }), null)
    assert.equal(store.calls.migrated.length, 0)
  })
})

test('a table-sourced session carries a profile id and no fingerprint', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [tableRow('2222')] })
    const access = await resolveAccessForPin('2222', { store })
    assert.equal(access.profileId, 'profile-1')
    assert.equal(access.credentialFingerprint, undefined)
  })
})

test('a blob-sourced session still carries its fingerprint', async () => {
  await withEnv(TABLE_ON, async () => {
    const access = await resolveAccessForPin('1111', { store: fakeStore() })
    assert.ok(access.credentialFingerprint, 'the existing mechanism is untouched')
    assert.equal(access.profileId, undefined)
  })
})

// The bug this design was shaped around: a session born from the table must
// survive its next request. If sessionFromRequest re-resolved it against the
// blob it would find nothing and sign the user straight back out.
test('a table-sourced session survives the next request', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [tableRow('2222')] })
    const access = await resolveAccessForPin('2222', { store })
    const token = createSessionToken(access)
    const request = new Request('https://example.test/', {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
    })
    const session = sessionFromRequest(request)
    assert.ok(session, 'not thrown away')
    assert.equal(session.role, 'school')
    assert.equal(session.locationId, 'CrestonMS')
    assert.equal(session.displayName, 'Creston Manager (edited)')
  })
})

// The same session, once the blob has been removed in Phase 3. This is the
// scenario that would have logged the whole district out at once.
test('a table-sourced session survives the blob being gone entirely', async () => {
  const token = await withEnv(TABLE_ON, async () => {
    const access = await resolveAccessForPin('2222', { store: fakeStore({ rows: [tableRow('2222')] }) })
    return createSessionToken(access)
  })

  await withEnv({ ...TABLE_ON, ATTENDANCE_ACCESS_CODES_JSON: undefined }, async () => {
    const request = new Request('https://example.test/', {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
    })
    const session = sessionFromRequest(request)
    assert.ok(session, 'no blob, no problem')
    assert.equal(session.locationId, 'CrestonMS')
  })
})

test('a database failure falls through to the blob rather than refusing sign-in', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ findThrows: true })
    const access = await resolveAccessForPin('2222', { store })
    assert.ok(access, 'nineteen people can still mark attendance')
    assert.equal(access.displayName, 'Creston Manager')
  })
})

test('with table auth off, the table is never consulted', async () => {
  await withEnv({ ...TABLE_ON, ATTENDANCE_TABLE_AUTH_ENABLED: 'false' }, async () => {
    const store = fakeStore({ rows: [tableRow('2222')] })
    const access = await resolveAccessForPin('2222', { store })
    assert.equal(store.calls.find, 0)
    assert.equal(store.calls.migrated.length, 0)
    assert.equal(access.displayName, 'Creston Manager', 'the blob answers, exactly as today')
  })
})

// The Phase 3 switch, provable before Phase 3.
test('with legacy codes off, only the table can sign anybody in', async () => {
  await withEnv({ ...TABLE_ON, ATTENDANCE_LEGACY_CODES_ENABLED: 'false' }, async () => {
    const store = fakeStore({ rows: [tableRow('2222')] })
    assert.ok(await resolveAccessForPin('2222', { store }), 'in the table, still fine')
    assert.equal(await resolveAccessForPin('1111', { store }), null, 'blob only, refused')
    assert.equal(store.calls.migrated.length, 0)
  })
})

test('a disabled profile falls through to the blob only while the blob still exists', async () => {
  await withEnv(TABLE_ON, async () => {
    // findByPin returns null for a disabled row, which is why this reaches
    // the blob at all. Once the blob is gone, disabled means refused.
    const store = fakeStore({ rows: [] })
    assert.ok(await resolveAccessForPin('2222', { store }))
  })
  await withEnv({ ...TABLE_ON, ATTENDANCE_LEGACY_CODES_ENABLED: 'false' }, async () => {
    const store = fakeStore({ rows: [] })
    assert.equal(await resolveAccessForPin('2222', { store }), null)
  })
})

test('a row the deriver rejects does not become a session', async () => {
  await withEnv({ ...TABLE_ON, ATTENDANCE_LEGACY_CODES_ENABLED: 'false' }, async () => {
    // role 'school' with no location is refused by normalizeAccessProfile.
    const store = fakeStore({ rows: [tableRow('2222', { location_id: null })] })
    assert.equal(await resolveAccessForPin('2222', { store }), null)
    assert.equal(profileFromRow(tableRow('2222', { location_id: null })).locationId, undefined)
  })
})

// --- usernames -----------------------------------------------------------
//
// Liz, 2026-10-26: "an extra level of security by adding a username to each
// login... start this with the admin member logins only first."
//
// The whole value of the feature is one rule — a profile that HAS a
// username cannot be reached without it — and the rule has three ways to
// leak: the table's own PIN lookup, the legacy blob behind it, and a
// database outage that makes both unreachable. One test each.

const ADMIN_WITH_USERNAME = {
  id: 'profile-liz',
  pin_lookup: pinLookup('1111'),
  username: 'eschmitt',
  display_name: 'Liz Schmitt',
  role: 'admin',
  location_id: null,
  employee_id: null,
  capabilities: { canEditAttendance: true, canManageRoster: true, canManageBlackouts: true },
  disabled_at: null,
}

test('a username and the right PIN sign in', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [ADMIN_WITH_USERNAME] })
    const access = await resolveAccessForPin('1111', { store, username: 'eschmitt' })
    assert.equal(access.displayName, 'Liz Schmitt')
    assert.equal(access.profileId, 'profile-liz')
  })
})

test('the username is not case sensitive, because nobody will remember that it was', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [ADMIN_WITH_USERNAME] })
    assert.ok(await resolveAccessForPin('1111', { store, username: '  EScHmitt ' }))
  })
})

test('a username with the wrong PIN is refused', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [ADMIN_WITH_USERNAME] })
    assert.equal(await resolveAccessForPin('9999', { store, username: 'eschmitt' }), null)
  })
})

// The rule. Without this the feature is a second box that changes nothing.
test('a login with a username cannot be reached by its PIN alone', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [ADMIN_WITH_USERNAME] })
    assert.equal(await resolveAccessForPin('1111', { store }), null)
  })
})

// And the leak behind the rule: 1111 is in the blob as well, so a refusal
// that merely "misses" would fall through and be granted by the blob.
test('a PIN-only attempt does not fall through to the legacy codes', async () => {
  await withEnv({ ...TABLE_ON, ATTENDANCE_LEGACY_CODES_ENABLED: 'true' }, async () => {
    const store = fakeStore({ rows: [ADMIN_WITH_USERNAME] })
    assert.equal(await resolveAccessForPin('1111', { store }), null)
    assert.deepEqual(store.calls.migrated, [], 'nothing migrated, because nothing was granted')
  })
})

// The honest cost, pinned so it cannot be forgotten: once a username is
// set, that login needs the database. The blob has no usernames, so there
// is nothing safe to fall back to.
test('a username sign-in fails closed when the database is unreachable', async () => {
  await withEnv({ ...TABLE_ON, ATTENDANCE_LEGACY_CODES_ENABLED: 'true' }, async () => {
    const store = fakeStore({ rows: [ADMIN_WITH_USERNAME], findThrows: true })
    assert.equal(await resolveAccessForPin('1111', { store, username: 'eschmitt' }), null)
  })
})

test('a username nobody holds is refused without reaching the blob', async () => {
  await withEnv({ ...TABLE_ON, ATTENDANCE_LEGACY_CODES_ENABLED: 'true' }, async () => {
    const store = fakeStore({ rows: [ADMIN_WITH_USERNAME] })
    assert.equal(await resolveAccessForPin('2222', { store, username: 'nobody' }), null)
    assert.deepEqual(store.calls.migrated, [])
  })
})

// The fifteen kitchens. Nothing about their sign-in may change.
test('a login with no username still signs in with its PIN alone', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [tableRow('2222')] })
    const access = await resolveAccessForPin('2222', { store })
    assert.equal(access.displayName, 'Creston Manager (edited)')
  })
})

test('a manager who types a username they were never given is refused, not let in', async () => {
  await withEnv(TABLE_ON, async () => {
    const store = fakeStore({ rows: [tableRow('2222')] })
    assert.equal(await resolveAccessForPin('2222', { store, username: 'cmanager' }), null)
  })
})

// Disabled rows are filtered by the store, not here, so the assertion that
// a disabled login cannot be reached by its username lives in
// access-store.test.mjs against the real query. Asserting it through this
// fake would only have tested the fake.
