import assert from 'node:assert/strict'

const baseUrl = String(process.env.BASE_URL || process.argv[2] || '').replace(/\/$/, '')
const testPin = String(process.env.TEST_PIN || process.argv[3] || '')

assert.match(baseUrl, /^https:\/\//, 'BASE_URL must be an HTTPS URL')
assert.match(testPin, /^\d{4,8}$/, 'TEST_PIN must contain 4 to 8 digits')

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    redirect: 'error',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  })
}

async function json(response) {
  const body = await response.json()
  return { response, body }
}

const results = []
const failures = []
function passed(name, details = {}) {
  results.push({ name, status: 'passed', ...details })
}
function failed(name, details = {}) {
  failures.push({ name, status: 'failed', ...details })
}

const homepage = await request('/')
assert.equal(homepage.status, 200)
assert.match(homepage.headers.get('content-security-policy') || '', /default-src 'self'/)
assert.equal(homepage.headers.get('x-content-type-options'), 'nosniff')
assert.equal(homepage.headers.get('x-frame-options'), 'DENY')
assert.equal(homepage.headers.get('cross-origin-opener-policy'), 'same-origin')
assert.equal(homepage.headers.get('cross-origin-resource-policy'), 'same-origin')
assert.match(homepage.headers.get('strict-transport-security') || '', /max-age=31536000/)
passed('homepage and hardened response headers', { statusCode: homepage.status })

const anonymousState = await json(await request('/api/state'))
assert.equal(anonymousState.response.status, 401)
assert.equal(anonymousState.body.error, 'Authentication required.')
assert.ok(anonymousState.response.headers.get('x-request-id'))
passed('anonymous state access is denied', { statusCode: anonymousState.response.status })

const wrongLogin = await json(await request('/api/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin: '11111111' }),
}))
assert.equal(wrongLogin.response.status, 401)
assert.equal(wrongLogin.body.error, 'Invalid PIN. Please try again.')
passed('invalid PIN is rejected', { statusCode: wrongLogin.response.status })

const login = await json(await request('/api/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin: testPin }),
}))
assert.equal(login.response.status, 200)
assert.equal(login.body.access.role, 'admin')
assert.equal(login.body.access.canManageRoster, true)
assert.equal(login.body.access.canManageBlackouts, true)
const setCookie = login.response.headers.get('set-cookie') || ''
const cookie = setCookie.split(';', 1)[0]
assert.match(cookie, /^attendance-session=/)
assert.match(setCookie, /HttpOnly/i)
assert.match(setCookie, /Secure/i)
assert.match(setCookie, /SameSite=Strict/i)
passed('valid login and hardened session cookie', { statusCode: login.response.status })

const authenticatedSession = await json(await request('/api/session', {
  headers: { Cookie: cookie },
}))
assert.equal(authenticatedSession.response.status, 200)
assert.equal(authenticatedSession.body.access.role, 'admin')
passed('server-backed session validation', { statusCode: authenticatedSession.response.status })

const initialState = await json(await request('/api/state', {
  headers: { Cookie: cookie },
}))
assert.equal(initialState.response.status, 200)
assert.equal(initialState.body.initialized, true)
assert.ok(Array.isArray(initialState.body.roster))
assert.ok(initialState.body.roster.length > 0)
const serializedRoster = JSON.stringify(initialState.body.roster)
assert.doesNotMatch(serializedRoster, /pay_amount|weekly_hours|middle_name|department/i)
passed('initialized isolated state and server-only roster filtering', {
  statusCode: initialState.response.status,
  rosterRecords: initialState.body.roster.length,
})

const testKey = `att-emp-loadtest-verification-${Date.now()}-2026`
const mutationForDate = date => ({
  action: 'mutate',
  key: testKey,
  mutation: {
    type: 'object-patch',
    set: { [date]: { code: 'RTO', date } },
    remove: [],
  },
})

const crossOriginWrite = await json(await request('/api/state', {
  method: 'POST',
  headers: {
    Cookie: cookie,
    'Content-Type': 'application/json',
    Origin: 'https://attacker.invalid',
  },
  body: JSON.stringify(mutationForDate('2026-09-01')),
}))
assert.equal(crossOriginWrite.response.status, 403)
assert.equal(crossOriginWrite.body.error, 'Cross-origin state changes are not allowed.')
passed('cross-origin mutation is denied', { statusCode: crossOriginWrite.response.status })

const invalidMutation = await json(await request('/api/state', {
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'mutate',
    key: testKey,
    mutation: {
      type: 'object-patch',
      set: { '2026-02-31': { code: 'RTO', date: '2026-02-31' } },
      remove: [],
    },
  }),
}))
assert.equal(invalidMutation.response.status, 400)
passed('invalid attendance mutation is rejected', { statusCode: invalidMutation.response.status })

const dates = Array.from({ length: 30 }, (_, index) =>
  `2026-09-${String(index + 1).padStart(2, '0')}`
)
const concurrentWrites = await Promise.all(dates.map(date => request('/api/state', {
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify(mutationForDate(date)),
})))
const writeStatuses = concurrentWrites.map(response => response.status)
assert.deepEqual([...new Set(writeStatuses)], [200])

const afterConcurrency = await json(await request('/api/state', {
  headers: { Cookie: cookie },
}))
assert.equal(afterConcurrency.response.status, 200)
const storedDates = Object.keys(afterConcurrency.body.entries[testKey] || {})
if (storedDates.length === dates.length && JSON.stringify(storedDates.sort()) === JSON.stringify(dates.sort())) {
  passed('30-way remote concurrent-write preservation', {
    successfulWrites: writeStatuses.length,
    persistedDates: storedDates.length,
  })
} else {
  failed('30-way remote concurrent-write preservation', {
    successfulWrites: writeStatuses.length,
    persistedDates: storedDates.length,
    missingDates: dates.filter(date => !storedDates.includes(date)),
  })
}

const logout = await json(await request('/api/session', {
  method: 'DELETE',
  headers: { Cookie: cookie },
}))
assert.equal(logout.response.status, 200)
assert.equal(logout.body.ok, true)
assert.match(logout.response.headers.get('set-cookie') || '', /Max-Age=0/i)

const replay = await json(await request('/api/session', {
  headers: { Cookie: cookie },
}))
assert.equal(replay.response.status, 401)
passed('logout revokes replay of the old session', { statusCode: replay.response.status })

console.log(JSON.stringify({
  baseUrl,
  passed: results.length,
  failed: failures.length,
  results: [...results, ...failures],
}, null, 2))

if (failures.length) process.exitCode = 1
