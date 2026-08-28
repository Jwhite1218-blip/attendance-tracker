import test from 'node:test'
import assert from 'node:assert/strict'
import employees from '../../../src/data/employees.json' with { type: 'json' }
import { handlePublicLeaderboard } from '../public-leaderboard.mjs'
import { PUBLIC_LEADERBOARD_SCHOOLS } from './public-leaderboards.mjs'

function memoryStore(entries) {
  return {
    async get(key) { return structuredClone(entries[key] ?? null) },
  }
}

test('public school leaderboard returns separate minimal recognition counts without private details', async () => {
  const school = PUBLIC_LEADERBOARD_SCHOOLS[0]
  const employee = employees.find(entry => entry.location === school.locationId)
  const separateRecognitionEmployee = employees.find(entry => (
    entry.location === school.locationId
    && String(entry.kronos_id || entry.id) !== String(employee.kronos_id || employee.id)
  ))
  const employeeId = String(employee.kronos_id || employee.id)
  const separateEmployeeId = String(separateRecognitionEmployee.kronos_id || separateRecognitionEmployee.id)
  const recognition = (id, type, recognizedEmployeeId = employeeId) => ({
    id,
    employeeId: recognizedEmployeeId,
    locationId: school.locationId,
    type,
    date: '2026-08-26',
    criteria: ['Private reason'],
    note: 'Private note',
    recognizedBy: 'Private manager',
  })
  const store = memoryStore({
    'all-star-recognition-v1': {
      daily: recognition('daily', 'star-of-day'),
      shout: recognition('shout', 'star-shout-out'),
      nomination: recognition('nomination', 'shooting-star'),
      monthly: recognition('monthly', 'all-star-of-month'),
      district: recognition('district', 'warren-employee-month'),
      separateShout: recognition('separate-shout', 'star-shout-out', separateEmployeeId),
    },
  })
  const response = await handlePublicLeaderboard(
    new Request(`https://example.test/api/public-leaderboard/${school.token}`),
    { stateStore: store }
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.deepEqual(body.leaders[0], {
    rank: 1,
    name: `${employee.first_name} ${employee.last_name}`,
    earnedStars: 1,
    dailyStars: 1,
    shoutOuts: 1,
    shootingNominations: 1,
    buildingAllStars: 1,
    employeeOfMonth: 1,
  })
  assert.deepEqual(body.leaders[1], {
    rank: 2,
    name: `${separateRecognitionEmployee.first_name} ${separateRecognitionEmployee.last_name}`,
    earnedStars: 0,
    dailyStars: 0,
    shoutOuts: 1,
    shootingNominations: 0,
    buildingAllStars: 0,
    employeeOfMonth: 0,
  })
  assert.equal(JSON.stringify(body).includes(employeeId), false)
  assert.equal(JSON.stringify(body).includes('Private note'), false)
  assert.equal(JSON.stringify(body).includes('Private reason'), false)
  assert.equal(JSON.stringify(body).includes('Private manager'), false)
})

test('unknown leaderboard tokens fail closed', async () => {
  const response = await handlePublicLeaderboard(
    new Request('https://example.test/api/public-leaderboard/not-a-real-card'),
    { stateStore: memoryStore({}) }
  )
  assert.equal(response.status, 404)
})
