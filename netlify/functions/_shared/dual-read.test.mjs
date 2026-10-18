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
    employeeId: 'emp-pwsfc85t',
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
