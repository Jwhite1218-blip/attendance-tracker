import assert from 'node:assert/strict'
import test from 'node:test'
import employees from './employees.json' with { type: 'json' }
import {
  MANAGER_GRADE_POSITIONS,
  drawManagerAllStar,
  getManagerDrawingEntries,
  getMonthlyDrawingEntries,
  isManagerGrade,
  managerEmployeeIds,
  splitLeaderboardByGrade,
} from './recognitionStore.js'

const star = (employeeId, date, locationId) => ({
  id: `${employeeId}-${date}`, type: 'star-of-day', employeeId, date, locationId,
})

test('the manager pool is the eighteen Liz named', () => {
  const ids = managerEmployeeIds(employees)
  assert.equal(ids.size, 18)

  const counts = {}
  for (const employee of employees.filter(isManagerGrade)) {
    counts[employee.position] = (counts[employee.position] || 0) + 1
  }
  assert.deepEqual(counts, {
    'Food Service Worker Lead': 15,
    'Food Service Manager': 2,
    'Food Service Director': 1,
  })
})

test('nobody else is swept into the pool', () => {
  for (const employee of employees) {
    assert.equal(
      isManagerGrade(employee),
      MANAGER_GRADE_POSITIONS.includes(employee.position),
      `${employee.position} classified wrongly`
    )
  }
  assert.equal(isManagerGrade({ position: 'Cook' }), false)
  assert.equal(isManagerGrade({ position: 'Food Service Worker' }), false)
  assert.equal(isManagerGrade({}), false)
  assert.equal(isManagerGrade(null), false)
})

test('a job title with stray spacing still resolves', () => {
  assert.equal(isManagerGrade({ position: '  Food Service Worker Lead ' }), true)
})

test('the building drawing is unchanged until the pool is handed to it', () => {
  // The split must not alter a drawing by merely existing.
  const records = [star('1', '2026-09-03', 'StonyBrkMS'), star('2', '2026-09-04', 'StonyBrkMS')]
  assert.equal(getMonthlyDrawingEntries(records, 'StonyBrkMS', '2026-09').length, 2)
})

test('managers drop out of their building drawing once the pool is passed', () => {
  const records = [
    star('lead', '2026-09-03', 'StonyBrkMS'),
    star('cook', '2026-09-04', 'StonyBrkMS'),
    star('cook', '2026-09-05', 'StonyBrkMS'),
  ]
  const entries = getMonthlyDrawingEntries(records, 'StonyBrkMS', '2026-09', new Set(['lead']))
  assert.equal(entries.length, 2)
  assert.ok(entries.every(entry => entry.employeeId === 'cook'))
})

test('the manager drawing spans the district, not one building', () => {
  // Most buildings have a single manager-grade person, so a per-building
  // manager drawing would pick the same name every month.
  const records = [
    star('leadA', '2026-09-03', 'StonyBrkMS'),
    star('leadB', '2026-09-04', 'CrestonMS'),
    star('cook', '2026-09-05', 'StonyBrkMS'),
  ]
  const entries = getManagerDrawingEntries(records, '2026-09', new Set(['leadA', 'leadB']))
  assert.equal(entries.length, 2)
  assert.deepEqual(entries.map(entry => entry.locationId).sort(), ['CrestonMS', 'StonyBrkMS'])
})

test('stars already earned count for the manager pool without being rewritten', () => {
  // This is what "their accumulated stars need to be changed over" means in
  // practice: the record is untouched and simply falls in the other pool.
  const earnedBefore = star('lead', '2026-08-20', 'StonyBrkMS')
  const entries = getManagerDrawingEntries([earnedBefore], '2026-08', new Set(['lead']))
  assert.equal(entries.length, 1)
  assert.deepEqual(entries[0], earnedBefore, 'the stored record is not modified')
})

test('the manager drawing weights repeat recognition, like the building one', () => {
  const records = [
    star('leadA', '2026-09-01', 'StonyBrkMS'),
    star('leadA', '2026-09-02', 'StonyBrkMS'),
    star('leadB', '2026-09-03', 'CrestonMS'),
  ]
  const ids = new Set(['leadA', 'leadB'])
  assert.equal(drawManagerAllStar(records, '2026-09', ids, 0).employeeId, 'leadA')
  assert.equal(drawManagerAllStar(records, '2026-09', ids, 0.99).employeeId, 'leadB')
  assert.equal(drawManagerAllStar(records, '2026-09', ids, 0).entryCount, 2)
  assert.equal(drawManagerAllStar(records, '2026-09', ids, 0).totalEntries, 3)
})

test('a month with no manager stars draws nobody rather than throwing', () => {
  assert.equal(drawManagerAllStar([], '2026-09', new Set(['lead'])), null)
  assert.equal(drawManagerAllStar([star('cook', '2026-09-01', 'X')], '2026-09', new Set(['lead'])), null)
  assert.deepEqual(getManagerDrawingEntries([star('a', '2026-09-01', 'X')], '2026-09', new Set()), [])
})

test('the leaderboard splits into two boards with nobody lost', () => {
  const entries = [
    { employee: { kronos_id: 'lead' }, count: 9 },
    { employee: { kronos_id: 'cook' }, count: 7 },
    { employee: { id: 'worker' }, count: 3 },
  ]
  const { managers, staff } = splitLeaderboardByGrade(entries, new Set(['lead']))
  assert.equal(managers.length, 1)
  assert.equal(staff.length, 2)
  assert.equal(managers.length + staff.length, entries.length)
})
