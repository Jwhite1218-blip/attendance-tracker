import { randomUUID } from 'node:crypto'
import employees from '../../src/data/employees.json' with { type: 'json' }
import { LOCATION_MAP } from '../../src/data/locations.js'
import { schoolYearStartFor } from '../../src/data/recognitionStore.js'
import {
  CUSTOM_EMPLOYEES_KEY,
  LOCATION_OVERRIDES_KEY,
  RECOGNITION_KEY,
  RECORD_OVERRIDES_KEY,
} from './_shared/permissions.mjs'
import { DEFAULT_REPORT_TIME_ZONE, localDateTimeParts } from './_shared/daily-report.mjs'
import { publicLeaderboardSchoolForToken } from './_shared/public-leaderboards.mjs'
import { getStateStore } from './_shared/state-store.mjs'

// What the school's board names, in the order it names them. Coach Bucks
// stay off it: the Leadership Track is district-only while it settles.
const PUBLIC_AWARD_TYPES = [
  'star-of-day',
  'star-shout-out',
  'shooting-star',
  'all-star-of-month',
  'warren-employee-month',
]

function employeeKey(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

function employeeName(employee) {
  return `${employee?.first_name || ''} ${employee?.last_name || ''}`.trim()
}

function publicJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200
        ? 'public, max-age=30, stale-while-revalidate=120'
        : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function schoolEmployees(entries, locationId) {
  const locationOverrides = entries[LOCATION_OVERRIDES_KEY] || {}
  const recordOverrides = entries[RECORD_OVERRIDES_KEY] || {}
  const customEmployees = Array.isArray(entries[CUSTOM_EMPLOYEES_KEY])
    ? entries[CUSTOM_EMPLOYEES_KEY]
    : []

  return [...employees, ...customEmployees]
    .map(employee => {
      const key = employeeKey(employee)
      const override = recordOverrides[key] || {}
      return {
        ...employee,
        first_name: override.first_name ?? employee.first_name,
        last_name: override.last_name ?? employee.last_name,
        location: locationOverrides[key] || override.location || employee.location,
        active: override.active !== false,
      }
    })
    .filter(employee => employee.active && employee.location === locationId)
}

// Who at this school has been recognized, and for what — never how often.
//
// Until 2026-11-11 this was a ranked leaderboard: every person numbered,
// their star total in large type, a gold row for first place. Jon took the
// rankings out of the app that day because recognition had become a
// contest, and a board on the cafeteria wall ranking coworkers by count was
// the most public version of it. So no rank and no number of any kind
// leaves this function — only names, in name order, and the kinds of
// recognition each has received. Somebody recognized once and somebody
// recognized ten times look the same, which is the point.
function buildPublicBoard(entries, locationId, schoolYearStart, monthKey) {
  const start = `${schoolYearStart}-07-01`
  const end = `${schoolYearStart + 1}-06-30`
  const recognitions = Object.values(entries[RECOGNITION_KEY] || {})
    .filter(record => (
      record
      && record.locationId === locationId
      && PUBLIC_AWARD_TYPES.includes(record.type)
      && String(record.date || '') >= start
      && String(record.date || '') <= end
    ))
  const awardsIn = records => PUBLIC_AWARD_TYPES.filter(type => records.some(record => record.type === type))

  const thisMonth = []
  const earlier = []
  for (const employee of schoolEmployees(entries, locationId)) {
    const records = recognitions.filter(record => String(record.employeeId) === employeeKey(employee))
    if (!records.length) continue
    const monthRecords = records.filter(record => String(record.date || '').startsWith(`${monthKey}-`))
    if (monthRecords.length) thisMonth.push({ name: employeeName(employee), awards: awardsIn(monthRecords) })
    else earlier.push({ name: employeeName(employee), awards: awardsIn(records) })
  }
  const byName = (left, right) => left.name.localeCompare(right.name)
  return { thisMonth: thisMonth.sort(byName), earlier: earlier.sort(byName) }
}

async function loadPublicEntries(store) {
  const keys = [
    RECOGNITION_KEY,
    LOCATION_OVERRIDES_KEY,
    RECORD_OVERRIDES_KEY,
    CUSTOM_EMPLOYEES_KEY,
  ]
  return Object.fromEntries(await Promise.all(
    keys.map(async key => [key, await store.get(key, { type: 'json' })])
  ))
}

export async function handlePublicLeaderboard(request, { stateStore, now = new Date() } = {}) {
  if (request.method !== 'GET') return publicJson({ error: 'Method not allowed.' }, 405)
  const token = new URL(request.url).pathname.split('/').filter(Boolean).at(-1)
  const schoolConfig = publicLeaderboardSchoolForToken(token)
  const location = schoolConfig ? LOCATION_MAP[schoolConfig.locationId] : null
  if (!schoolConfig || !location || location.id === 'Admin') {
    return publicJson({ error: 'Leaderboard not found.' }, 404)
  }

  const store = stateStore || getStateStore()
  const entries = await loadPublicEntries(store)
  // The district's month, not the server's: in UTC, an evening on the last
  // day of the month in Indianapolis is already the next month.
  const today = localDateTimeParts(now, DEFAULT_REPORT_TIME_ZONE).dateKey
  const schoolYearStart = schoolYearStartFor(today)
  const monthKey = today.slice(0, 7)
  return publicJson({
    school: { name: location.name, shortName: location.shortName },
    schoolYear: `${schoolYearStart}-${schoolYearStart + 1}`,
    month: monthKey,
    ...buildPublicBoard(entries, location.id, schoolYearStart, monthKey),
    // A page already open on a wall keeps the old script until it reloads,
    // and that script reads `leaders`. Empty, it shows "the board is ready"
    // rather than failing — and carries no ranking.
    leaders: [],
    updatedAt: now.toISOString(),
  })
}

export default async request => {
  const requestId = randomUUID()
  try {
    const response = await handlePublicLeaderboard(request)
    response.headers.set('X-Request-ID', requestId)
    return response
  } catch (error) {
    console.error(JSON.stringify({ event: 'public-leaderboard-error', requestId, message: error.message }))
    return publicJson({ error: 'The leaderboard is temporarily unavailable.', requestId }, 503)
  }
}

export const config = {
  path: '/api/public-leaderboard/:token',
}
