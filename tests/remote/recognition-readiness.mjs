import assert from 'node:assert/strict'
import { LOCATION_MAP } from '../../src/data/locations.js'
import { PUBLIC_LEADERBOARD_SCHOOLS } from '../../netlify/functions/_shared/public-leaderboards.mjs'

const baseUrl = String(process.env.BASE_URL || process.argv[2] || '').replace(/\/$/, '')
assert.match(baseUrl, /^https:\/\//, 'BASE_URL must be an HTTPS URL')

const FORBIDDEN_PUBLIC_FIELDS = [
  'attendance',
  'criteria',
  'employeeId',
  'hr',
  'kronos',
  'locationId',
  'note',
  'recognizedBy',
  'sourceName',
]
// Since 2026-11-11 the school boards name people and the kinds of
// recognition they have had — no rank and no count of anything.
const EXPECTED_PERSON_FIELDS = ['awards', 'name']
const PUBLIC_AWARD_TYPES = new Set([
  'star-of-day',
  'star-shout-out',
  'shooting-star',
  'all-star-of-month',
  'warren-employee-month',
])

async function request(path) {
  return fetch(`${baseUrl}${path}`, {
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
}

assert.equal(PUBLIC_LEADERBOARD_SCHOOLS.length, 15, 'Exactly 15 school links are required.')
assert.equal(
  new Set(PUBLIC_LEADERBOARD_SCHOOLS.map(entry => entry.locationId)).size,
  PUBLIC_LEADERBOARD_SCHOOLS.length,
  'School leaderboard locations must be unique.'
)
assert.equal(
  new Set(PUBLIC_LEADERBOARD_SCHOOLS.map(entry => entry.token)).size,
  PUBLIC_LEADERBOARD_SCHOOLS.length,
  'School leaderboard tokens must be unique.'
)

const homepage = await request('/')
assert.equal(homepage.status, 200, 'The test application must be available.')
assert.match(homepage.headers.get('content-security-policy') || '', /default-src 'self'/)
assert.equal(homepage.headers.get('x-frame-options'), 'DENY')

const anonymousState = await request('/api/state')
assert.equal(anonymousState.status, 401, 'Attendance state must deny anonymous requests.')

const checks = await Promise.all(PUBLIC_LEADERBOARD_SCHOOLS.map(async entry => {
  const location = LOCATION_MAP[entry.locationId]
  assert.ok(location, `Unknown location ${entry.locationId}.`)

  const response = await request(`/api/public-leaderboard/${encodeURIComponent(entry.token)}`)
  assert.equal(response.status, 200, `${location.name} public API is unavailable.`)
  assert.match(response.headers.get('content-type') || '', /^application\/json/i)
  assert.match(response.headers.get('cache-control') || '', /max-age=30/)
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  assert.ok(response.headers.get('x-request-id'), `${location.name} is missing a request ID.`)

  const body = await response.json()
  assert.equal(body.school?.name, location.name, `${location.name} resolved to the wrong school.`)
  assert.match(body.schoolYear || '', /^\d{4}-\d{4}$/)
  assert.match(body.month || '', /^\d{4}-\d{2}$/)
  assert.ok(Array.isArray(body.thisMonth), `${location.name} thisMonth must be an array.`)
  assert.ok(Array.isArray(body.earlier), `${location.name} earlier must be an array.`)
  assert.deepEqual(body.leaders, [], `${location.name} must not send a ranked list.`)
  assert.match(body.updatedAt || '', /^\d{4}-\d{2}-\d{2}T/)

  const serialized = JSON.stringify(body)
  for (const field of FORBIDDEN_PUBLIC_FIELDS) {
    assert.doesNotMatch(
      serialized,
      new RegExp(`"${field}"\\s*:`),
      `${location.name} exposed forbidden field ${field}.`
    )
  }

  for (const group of [body.thisMonth, body.earlier]) {
    const names = group.map(person => person.name)
    assert.deepEqual(names, [...names].sort((left, right) => left.localeCompare(right)), `${location.name} is not in name order.`)
  }
  const people = [...body.thisMonth, ...body.earlier]
  people.forEach(person => {
    assert.deepEqual(Object.keys(person).sort(), EXPECTED_PERSON_FIELDS)
    assert.equal(typeof person.name, 'string')
    assert.ok(person.name.trim(), `${location.name} exposed a blank employee name.`)
    assert.ok(Array.isArray(person.awards) && person.awards.length, `${location.name} lists somebody with no award.`)
    for (const award of person.awards) {
      assert.ok(PUBLIC_AWARD_TYPES.has(award), `${location.name} exposed award type ${award}.`)
    }
  })

  const page = await request(`/school-stars/${encodeURIComponent(entry.token)}`)
  assert.equal(page.status, 200, `${location.name} NFC page is unavailable.`)

  return { school: location.name, recognizedThisMonth: body.thisMonth.length, recognizedEarlier: body.earlier.length }
}))

const missing = await request('/api/public-leaderboard/not-a-real-school-token')
assert.equal(missing.status, 404, 'Unknown public leaderboard tokens must fail closed.')
assert.deepEqual(await missing.json(), { error: 'Leaderboard not found.' })

console.log(JSON.stringify({
  baseUrl,
  schoolsVerified: checks.length,
  anonymousStateStatus: anonymousState.status,
  unknownTokenStatus: missing.status,
  checks,
}, null, 2))
