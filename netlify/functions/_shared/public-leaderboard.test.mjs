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

test('public school board names who was recognized and for what, with no counts, ranks or private details', async () => {
  const school = PUBLIC_LEADERBOARD_SCHOOLS[0]
  const employee = employees.find(entry => entry.location === school.locationId)
  const separateRecognitionEmployee = employees.find(entry => (
    entry.location === school.locationId
    && String(entry.kronos_id || entry.id) !== String(employee.kronos_id || employee.id)
  ))
  const employeeId = String(employee.kronos_id || employee.id)
  const separateEmployeeId = String(separateRecognitionEmployee.kronos_id || separateRecognitionEmployee.id)
  const recognition = (id, type, recognizedEmployeeId = employeeId, date = '2026-11-04') => ({
    id,
    employeeId: recognizedEmployeeId,
    locationId: school.locationId,
    type,
    date,
    criteria: ['Private reason'],
    note: 'Private note',
    recognizedBy: 'Private manager',
  })
  const store = memoryStore({
    'all-star-recognition-v1': {
      // Three stars this month: on the board that is one name with one
      // "Star of the Day", exactly as if there were one.
      daily1: recognition('daily1', 'star-of-day'),
      daily2: recognition('daily2', 'star-of-day', employeeId, '2026-11-05'),
      daily3: recognition('daily3', 'star-of-day', employeeId, '2026-11-06'),
      shout: recognition('shout', 'star-shout-out'),
      nomination: recognition('nomination', 'shooting-star', employeeId, '2026-10-02'),
      buck: recognition('buck', 'ace-buck'),
      separateShout: recognition('separate-shout', 'star-shout-out', separateEmployeeId, '2026-09-15'),
      separateDrawn: recognition('separate-drawn', 'all-star-of-month', separateEmployeeId, '2026-09-30'),
    },
  })
  const response = await handlePublicLeaderboard(
    new Request(`https://example.test/api/public-leaderboard/${school.token}`),
    // Evening of 11 November in Indianapolis is already the 12th in UTC;
    // either way the board's month is November.
    { stateStore: store, now: new Date('2026-11-12T01:30:00Z') }
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.equal(body.month, '2026-11')
  assert.deepEqual(body.thisMonth, [{
    name: `${employee.first_name} ${employee.last_name}`,
    // This month's kinds only; the October nomination is not repeated here,
    // and a Coach Buck never reaches the public board.
    awards: ['star-of-day', 'star-shout-out'],
  }])
  assert.deepEqual(body.earlier, [{
    name: `${separateRecognitionEmployee.first_name} ${separateRecognitionEmployee.last_name}`,
    awards: ['star-shout-out', 'all-star-of-month'],
  }])
  // Kept for pages already open on the old script, and empty.
  assert.deepEqual(body.leaders, [])

  // No number about anybody leaves the server.
  const people = [...body.thisMonth, ...body.earlier]
  for (const entry of people) assert.deepEqual(Object.keys(entry).sort(), ['awards', 'name'])
  assert.equal(JSON.stringify(people).match(/\d/), null)
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
