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

test('anything other than a read is refused', async () => {
  await withEnv(BASE_ENV, async () => {
    const sessions = createMemoryBlobStore()
    const token = await signedIn(LIZ, sessions)
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await handler(request(token, { method }), {}, { sessions })
      assert.equal(response.status, 405, `${method}`)
    }
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
