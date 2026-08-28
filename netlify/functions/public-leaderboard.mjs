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
import { publicLeaderboardSchoolForToken } from './_shared/public-leaderboards.mjs'
import { getStateStore } from './_shared/state-store.mjs'

const PUBLIC_EARNED_STAR_TYPES = new Set(['star-of-day'])

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

function buildPublicLeaders(entries, locationId, schoolYearStart) {
  const start = `${schoolYearStart}-07-01`
  const end = `${schoolYearStart + 1}-06-30`
  const recognitions = Object.values(entries[RECOGNITION_KEY] || {})
    .filter(record => (
      record
      && record.locationId === locationId
      && String(record.date || '') >= start
      && String(record.date || '') <= end
    ))

  return schoolEmployees(entries, locationId)
    .map(employee => {
      const records = recognitions.filter(record => String(record.employeeId) === employeeKey(employee))
      const dailyStars = records.filter(record => record.type === 'star-of-day').length
      const shoutOuts = records.filter(record => record.type === 'star-shout-out').length
      const shootingNominations = records.filter(record => record.type === 'shooting-star').length
      const buildingAllStars = records.filter(record => record.type === 'all-star-of-month').length
      const employeeOfMonth = records.filter(record => record.type === 'warren-employee-month').length
      const earnedStars = records.filter(record => PUBLIC_EARNED_STAR_TYPES.has(record.type)).length
      return {
        name: employeeName(employee),
        earnedStars,
        dailyStars,
        shoutOuts,
        shootingNominations,
        buildingAllStars,
        employeeOfMonth,
      }
    })
    .filter(entry => (
      entry.earnedStars > 0
      || entry.shoutOuts > 0
      || entry.shootingNominations > 0
      || entry.buildingAllStars > 0
      || entry.employeeOfMonth > 0
    ))
    .sort((left, right) => (
      right.earnedStars - left.earnedStars
      || right.dailyStars - left.dailyStars
      || right.buildingAllStars - left.buildingAllStars
      || right.employeeOfMonth - left.employeeOfMonth
      || right.shoutOuts - left.shoutOuts
      || right.shootingNominations - left.shootingNominations
      || left.name.localeCompare(right.name)
    ))
    .map((entry, index) => ({ rank: index + 1, ...entry }))
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

export async function handlePublicLeaderboard(request, { stateStore } = {}) {
  if (request.method !== 'GET') return publicJson({ error: 'Method not allowed.' }, 405)
  const token = new URL(request.url).pathname.split('/').filter(Boolean).at(-1)
  const schoolConfig = publicLeaderboardSchoolForToken(token)
  const location = schoolConfig ? LOCATION_MAP[schoolConfig.locationId] : null
  if (!schoolConfig || !location || location.id === 'Admin') {
    return publicJson({ error: 'Leaderboard not found.' }, 404)
  }

  const store = stateStore || getStateStore()
  const entries = await loadPublicEntries(store)
  const schoolYearStart = schoolYearStartFor(new Date())
  return publicJson({
    school: { name: location.name, shortName: location.shortName },
    schoolYear: `${schoolYearStart}-${schoolYearStart + 1}`,
    leaders: buildPublicLeaders(entries, location.id, schoolYearStart),
    updatedAt: new Date().toISOString(),
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
