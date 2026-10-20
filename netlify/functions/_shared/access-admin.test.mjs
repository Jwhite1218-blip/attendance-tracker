// The access list endpoint returns every PIN in the district, so the tests
// that matter are the ones about who is refused.
import test from 'node:test'
import assert from 'node:assert/strict'
import handler, { publicProfile } from '../access-admin.mjs'
import { SESSION_COOKIE, createSessionToken } from './auth.mjs'
import { encryptPin } from './pin-crypto.mjs'
import { createMemoryBlobStore } from './test-blob-store.mjs'
import { registerServerSession } from './server-session.mjs'

const KEY = 'e'.repeat(64)
process.env.ATTENDANCE_PIN_KEY = KEY

const BASE_ENV = {
  ATTENDANCE_SESSION_SECRET: 'test-secret',
  ATTENDANCE_PIN_KEY: KEY,
  ATTENDANCE_TABLE_AUTH_ENABLED: 'true',
  ATTENDANCE_STATE_BACKEND: 'supabase',
  ATTENDANCE_ACCESS_CODES_JSON: JSON.stringify({ 1111: { role: 'admin', displayName: 'Liz' } }),
  ATTENDANCE_LIZ_REPLACEMENT_PIN: undefined,
  ATTENDANCE_CHEF_PIN: undefined,
  ATTENDANCE_RECOGNITION_PILOT_PINS_JSON: undefined,
}

const LIZ = {
  role: 'admin',
  displayName: 'Elizabeth Schmitt',
  canEditAttendance: true,
  canManageRoster: true,
  canManageBlackouts: true,
}
const MANAGER = {
  role: 'school',
  displayName: 'Creston Manager',
  locationId: 'CrestonMS',
  canEditAttendance: true,
}
const LIMITED_ADMIN = {
  role: 'admin',
  displayName: 'District Office',
  canEditAttendance: true,
  canManageRoster: false,
  canManageBlackouts: false,
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

// A real in-memory session registry, so these tests exercise the
// authorisation decision against genuinely valid sessions rather than
// against a stub that would pass anything.
async function signedIn(access, sessions) {
  const token = createSessionToken(access)
  const probe = new Request('https://allstartracker.netlify.app/', {
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}` },
  })
  const { sessionFromRequest } = await import('./auth.mjs')
  await registerServerSession(sessionFromRequest(probe), sessions)
  return token
}

function request(token, { method = 'GET' } = {}) {
  const headers = {}
  if (token) headers.cookie = `${SESSION_COOKIE}=${encodeURIComponent(token)}`
  return new Request('https://allstartracker.netlify.app/api/access-admin', { method, headers })
}

test('an unauthenticated request is refused', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const response = await handler(request(null), {}, { sessions })
    assert.equal(response.status, 401)
  })
})

// The page hides itself from a manager, but the page is a convenience. This
// is the boundary, and it has to refuse on its own.
test('a building manager is refused even with a valid session', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(MANAGER, sessions)
    const response = await handler(request(token), {}, { sessions })
    assert.equal(response.status, 403, 'refused on authorisation, not authentication')
    const body = await response.json()
    assert.equal(Array.isArray(body.profiles), false, 'no profiles leak on refusal')
  })
})

test('an administrator below Liz\'s tier is refused', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(LIMITED_ADMIN, sessions)
    const response = await handler(request(token), {}, { sessions })
    assert.equal(response.status, 403)
    const body = await response.json()
    assert.equal(body.profiles, undefined)
  })
})

test('PUT and DELETE are not verbs this endpoint has', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(LIZ, sessions)
    for (const method of ['PUT', 'DELETE']) {
      const response = await handler(request(token, { method }), {}, { sessions })
      assert.equal(response.status, 405, method)
    }
  })
})

// --- write operations -------------------------------------------------------

function fakeAccessStore(rows = []) {
  const profiles = [...rows]
  const store = {
    profiles,
    async listProfiles() { return profiles },
    async findById(id) { return profiles.find(row => row.id === id) || null },
    async createProfile(input) {
      const row = {
        id: `created-${profiles.length + 1}`,
        pin_encrypted: encryptPin(input.pin),
        pin_length: input.pin.length,
        display_name: input.displayName,
        role: input.role,
        location_id: input.locationId,
        capabilities: input.capabilities,
        disabled_at: null,
      }
      profiles.push(row)
      return row
    },
    async updateProfile(id, patch) {
      const row = profiles.find(item => item.id === id)
      if (!row) return null
      if (patch.pin !== undefined) {
        row.pin_encrypted = encryptPin(patch.pin)
        row.pin_length = patch.pin.length
      }
      if (patch.displayName !== undefined) row.display_name = patch.displayName
      if (patch.role !== undefined) row.role = patch.role
      if (patch.locationId !== undefined) row.location_id = patch.locationId
      if (patch.capabilities !== undefined) row.capabilities = patch.capabilities
      if (patch.disabledAt !== undefined) row.disabled_at = patch.disabledAt
      return row
    },
  }
  return store
}

function adminRow(overrides = {}) {
  return {
    id: 'liz-id',
    pin_encrypted: encryptPin('1111'),
    pin_length: 4,
    display_name: 'Elizabeth Schmitt',
    role: 'admin',
    location_id: null,
    capabilities: { canManageRoster: true, canManageBlackouts: true },
    disabled_at: null,
    ...overrides,
  }
}

function send(token, method, body) {
  return new Request('https://allstartracker.netlify.app/api/access-admin', {
    method,
    headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('a new school login is created and reads back with its code', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(LIZ, sessions)
    const access = fakeAccessStore([adminRow()])
    const response = await handler(
      send(token, 'POST', {
        pin: '4321',
        displayName: 'Sunny Heights Manager',
        role: 'school',
        locationId: 'SunnyHt ES',
        capabilities: { canEditAttendance: true },
      }),
      {}, { sessions, access }
    )
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.profile.pin, '4321', 'readable straight back, no write-it-down-now')
    assert.equal(body.profile.locationId, 'SunnyHt ES')
  })
})

test('creating refuses a bad code or a school with no building', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(LIZ, sessions)
    const access = fakeAccessStore([adminRow()])
    for (const [body, pattern] of [
      [{ pin: '12', displayName: 'X', role: 'school', locationId: 'CrestonMS' }, /4 to 8 digits/],
      [{ pin: '4321', displayName: 'X', role: 'school' }, /which school/],
      [{ pin: '4321', displayName: '  ', role: 'admin' }, /a name/],
    ]) {
      const response = await handler(send(token, 'POST', body), {}, { sessions, access })
      assert.equal(response.status, 409, JSON.stringify(body))
      assert.match((await response.json()).error, pattern)
    }
    assert.equal(access.profiles.length, 1, 'nothing was written')
  })
})

test('a code can be changed, and comes back readable', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(LIZ, sessions)
    const school = adminRow({
      id: 'school-id', display_name: 'Creston Manager', role: 'school',
      location_id: 'CrestonMS', capabilities: { canEditAttendance: true },
    })
    const access = fakeAccessStore([adminRow(), school])
    const response = await handler(send(token, 'PATCH', { id: 'school-id', pin: '5566' }), {}, { sessions, access })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).profile.pin, '5566')
  })
})

// The guardrails, reached through HTTP rather than called directly, because
// the page is not the thing that has to hold.
test('you cannot disable your own login through the endpoint', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(LIZ, sessions)
    const access = fakeAccessStore([adminRow(), adminRow({ id: 'other', display_name: 'Marlene & Reese' })])
    const response = await handler(send(token, 'PATCH', { id: 'liz-id', disabled: true }), {}, { sessions, access })
    assert.equal(response.status, 409)
    assert.match((await response.json()).error, /your own login/)
    assert.equal(access.profiles[0].disabled_at, null)
  })
})

test('the last full administrator cannot be stood down through the endpoint', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn({ ...LIZ, displayName: 'Someone Else' }, sessions)
    const access = fakeAccessStore([adminRow()])
    const response = await handler(send(token, 'PATCH', { id: 'liz-id', disabled: true }), {}, { sessions, access })
    assert.equal(response.status, 409)
    assert.match((await response.json()).error, /last full administrator/)
  })
})

test('a manager cannot create a login even by calling the endpoint directly', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(MANAGER, sessions)
    const access = fakeAccessStore([adminRow()])
    const response = await handler(
      send(token, 'POST', { pin: '4321', displayName: 'Backdoor', role: 'admin' }),
      {}, { sessions, access }
    )
    assert.equal(response.status, 403)
    assert.equal(access.profiles.length, 1)
  })
})

test('an update with nothing in it is refused rather than silently succeeding', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(LIZ, sessions)
    const access = fakeAccessStore([adminRow()])
    const response = await handler(send(token, 'PATCH', { id: 'liz-id' }), {}, { sessions, access })
    assert.equal(response.status, 409)
    assert.match((await response.json()).error, /Nothing to change/)
  })
})

test('an update to a login that does not exist is refused', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(LIZ, sessions)
    const access = fakeAccessStore([adminRow()])
    const response = await handler(send(token, 'PATCH', { id: 'ghost', pin: '4321' }), {}, { sessions, access })
    assert.equal(response.status, 409)
    assert.match((await response.json()).error, /no longer exists/)
  })
})

// A row whose PIN will not decrypt is still a real credential. Hiding it
// would leave access the screen does not show.
test('an unreadable PIN still lists the profile, marked unreadable', async () => {
  await withEnv(BASE_ENV, async () => {
    const good = publicProfile({
      id: 'a', pin_encrypted: encryptPin('1742'), pin_length: 4,
      display_name: 'Creston', role: 'school', location_id: 'CrestonMS',
    })
    assert.equal(good.pin, '1742')
    assert.equal(good.pinReadable, true)

    const bad = publicProfile({
      id: 'b', pin_encrypted: 'v1.garbage.garbage.garbage', pin_length: 4,
      display_name: 'Broken Row', role: 'admin', location_id: null,
    })
    assert.equal(bad.pin, null)
    assert.equal(bad.pinReadable, false)
    assert.equal(bad.displayName, 'Broken Row', 'still listed')
  })
})

// Liz, 2026-10-19: "I don't see the Employee of the Month as an option."
//
// A profile stores only the flags somebody set explicitly. Everything else
// is derived at sign-in — an administrator holding roster and blackout
// management gets award draws without anybody ticking a box. The admin
// screen was only ever sent the stored half, so an implicit capability
// showed as unticked, and saving the form wrote that off for real.
test('a capability nobody ticked is still reported as held', () => {
  const profile = publicProfile({
    id: 'p1',
    role: 'admin',
    display_name: 'District administrator',
    // Exactly what a migrated row looks like: the two flags that were set,
    // and nothing about award draws.
    capabilities: { canManageRoster: true, canManageBlackouts: true },
    pin_length: 4,
  })

  assert.equal(profile.capabilities.canManageRecognitionAwards, undefined, 'nothing is stored')
  assert.equal(profile.effectiveCapabilities.canManageRecognitionAwards, true, 'but it is held')
  assert.equal(profile.effectiveCapabilities.canManageRoster, true)
  assert.equal(profile.effectiveCapabilities.canEditAttendance, true)
})

test('an explicitly withheld capability stays withheld', () => {
  const profile = publicProfile({
    id: 'p2',
    role: 'admin',
    display_name: 'District assistant',
    capabilities: { canManageRoster: true, canManageBlackouts: true, canManageRecognitionAwards: false },
    pin_length: 4,
  })
  assert.equal(profile.effectiveCapabilities.canManageRecognitionAwards, false)
})

test('a building login is not credited with district capabilities', () => {
  const profile = publicProfile({
    id: 'p3',
    role: 'school',
    display_name: 'Creston MS',
    location_id: 'CrestonMS',
    capabilities: {},
    pin_length: 4,
  })
  assert.equal(profile.effectiveCapabilities.canManageRoster, false)
  assert.equal(profile.effectiveCapabilities.canManageRecognitionAwards, false)
  assert.equal(profile.effectiveCapabilities.canEditRecognition, true, 'a building still records its own')
})

test('editing a profile cannot switch off a capability nobody touched', () => {
  // The screen seeds its tick boxes from effectiveCapabilities and submits
  // them back. With the stored half it submitted false for anything
  // implicit, which is how the capability was lost.
  const row = {
    id: 'p4',
    role: 'admin',
    display_name: 'District administrator',
    capabilities: { canManageRoster: true, canManageBlackouts: true },
    pin_length: 4,
  }
  const seeded = publicProfile(row).effectiveCapabilities
  assert.equal(seeded.canManageRecognitionAwards, true)

  // Save it straight back with no change, and the capability survives.
  const saved = publicProfile({ ...row, capabilities: seeded })
  assert.equal(saved.effectiveCapabilities.canManageRecognitionAwards, true)
})
