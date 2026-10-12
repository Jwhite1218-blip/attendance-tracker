import assert from 'node:assert/strict'
import test from 'node:test'
import { configureClientAccess, flushPendingWrites } from './sharedStore.js'
import {
  assignmentTimeline,
  getAssignmentHistory,
  recordAssignmentChange,
} from './assignmentHistory.js'
import { installTestBrowserStorage } from './testBrowserStorage.js'

test.beforeEach(() => {
  installTestBrowserStorage()
  configureClientAccess({ role: 'admin', canManageRoster: true, canManageBlackouts: true })
})

test('a move is recorded with where it came from and who made it', () => {
  recordAssignmentChange('900', 'CrestonMS', 'StonyBrkMS', 'Liz')
  flushPendingWrites()

  const entries = getAssignmentHistory('900')
  assert.equal(entries.length, 1)
  assert.equal(entries[0].from, 'CrestonMS')
  assert.equal(entries[0].to, 'StonyBrkMS')
  assert.equal(entries[0].by, 'Liz')
  assert.match(entries[0].at, /^\d{4}-\d{2}-\d{2}T/)
})

// The edit form calls through on every save, not only when the school changed.
test('saving without changing the school records nothing', () => {
  recordAssignmentChange('901', 'CrestonMS', 'CrestonMS', 'Liz')
  flushPendingWrites()
  assert.deepEqual(getAssignmentHistory('901'), [])
})

test('a move with no destination is ignored rather than stored half-formed', () => {
  recordAssignmentChange('902', 'CrestonMS', '', 'Liz')
  recordAssignmentChange('902', 'CrestonMS', null, 'Liz')
  flushPendingWrites()
  assert.deepEqual(getAssignmentHistory('902'), [])
})

test('moves accumulate in the order they happened', () => {
  recordAssignmentChange('903', 'CrestonMS', 'StonyBrkMS', 'Liz')
  recordAssignmentChange('903', 'StonyBrkMS', 'WarrenCnHS', 'Liz')
  flushPendingWrites()

  assert.deepEqual(
    getAssignmentHistory('903').map(entry => `${entry.from}>${entry.to}`),
    ['CrestonMS>StonyBrkMS', 'StonyBrkMS>WarrenCnHS']
  )
})

test('one employee\'s history does not leak into another\'s', () => {
  recordAssignmentChange('904', 'CrestonMS', 'StonyBrkMS', 'Liz')
  flushPendingWrites()
  assert.deepEqual(getAssignmentHistory('905'), [])
})

// Nothing recorded the school an employee started in, so the timeline has to
// infer it from the first move. Getting this wrong would silently drop the
// place most of their service happened.
test('the timeline opens with the school they started in', () => {
  recordAssignmentChange('906', 'CrestonMS', 'StonyBrkMS', 'Liz')
  recordAssignmentChange('906', 'StonyBrkMS', 'WarrenCnHS', 'Liz')
  flushPendingWrites()

  const stops = assignmentTimeline('906', 'WarrenCnHS')
  assert.deepEqual(stops.map(stop => stop.locationId), ['CrestonMS', 'StonyBrkMS', 'WarrenCnHS'])
  assert.equal(stops[0].since, null, 'the first stop has no recorded start')
  assert.equal(stops.at(-1).until, null, 'the current stop has not ended')
})

test('someone who has never moved shows only where they are', () => {
  assert.deepEqual(
    assignmentTimeline('907', 'CrestonMS'),
    [{ locationId: 'CrestonMS', since: null, until: null }]
  )
  assert.deepEqual(assignmentTimeline('907', ''), [])
})

test('corrupt stored history reads as empty rather than throwing', () => {
  localStorage.setItem('employee-assignment-history-v1', '{"908": "not an array"}')
  assert.deepEqual(getAssignmentHistory('908'), [])
  localStorage.setItem('employee-assignment-history-v1', 'not json at all')
  assert.deepEqual(getAssignmentHistory('908'), [])
})
