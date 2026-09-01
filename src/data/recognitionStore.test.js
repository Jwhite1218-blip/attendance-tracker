import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ALL_STAR_REASON_OPTIONS,
  createRecognitionRecord,
  drawMonthlyAllStar,
  getEmployeeStarCount,
  getMonthlyDrawingEntries,
  getNextStarLevel,
  getStarLevel,
  schoolYearStartFor,
  requiresStarMessage,
  submitterLocationLabel,
  getSubmissionCountsByLocation,
} from './recognitionStore.js'

function recognition(overrides = {}) {
  return {
    id: 'record-1',
    employeeId: '123',
    locationId: 'SchoolA',
    type: 'star-of-day',
    date: '2026-08-20',
    monthKey: null,
    criteria: ['Service'],
    note: '',
    sourceName: '',
    recognizedBy: 'Manager',
    recognizedByLocationId: '',
    createdAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  }
}

test('recognition records preserve approved program criteria', () => {
  assert.deepEqual(createRecognitionRecord({
    employeeId: '123',
    locationId: 'SchoolA',
    type: 'star-of-day',
    date: '2026-08-20',
    criteria: ['Service', 'Not a program criterion'],
    note: 'Great service during lunch.',
  }, { id: 'record-1', createdAt: '2026-08-20T12:00:00.000Z' }), recognition({
    note: 'Great service during lunch.',
    recognizedBy: '',
  }))
})

test('daily recognition reasons use the manager-approved operating categories', () => {
  assert.deepEqual(ALL_STAR_REASON_OPTIONS, [
    'Teamwork',
    'Service',
    'Safety',
    'Culinary',
    'Reliability',
    'Positivity',
    'Other',
  ])
})

test('only Star of the Day advances the school-year star count', () => {
  const records = [
    recognition(),
    recognition({ id: 'record-2', type: 'star-shout-out', date: '2027-03-01' }),
    recognition({ id: 'employee-month', type: 'warren-employee-month', date: '2027-03-03' }),
    recognition({ id: 'nomination', type: 'shooting-star', date: '2027-03-02' }),
    recognition({ id: 'record-3', type: 'all-star-of-month', date: '2026-08-31', monthKey: '2026-08' }),
    recognition({ id: 'record-4', type: 'star-of-day', date: '2026-06-30' }),
  ]
  assert.equal(getEmployeeStarCount(records, '123', 2026), 1)
  assert.equal(schoolYearStartFor('2027-05-01'), 2026)
  assert.equal(schoolYearStartFor('2027-07-01'), 2027)
})

test('Shooting Star nominations and Shout-Outs remain visible without adding earned stars', () => {
  const records = [
    recognition(),
    recognition({ id: 'nomination', type: 'shooting-star' }),
    recognition({ id: 'shout-out', type: 'star-shout-out' }),
  ]
  assert.equal(getEmployeeStarCount(records, '123', 2026), 1)
})

test('recognition levels use the five thresholds from the program', () => {
  assert.equal(getStarLevel(4), null)
  assert.equal(getStarLevel(5).name, 'Bronze Star')
  assert.equal(getStarLevel(30).name, 'Platinum Star')
  assert.equal(getStarLevel(75).name, 'Superstar')
  assert.equal(getNextStarLevel(10).name, 'Gold Star')
  assert.equal(getNextStarLevel(50), null)
})

test('monthly drawing gives one weighted entry per daily recognition', () => {
  const records = [
    recognition({ id: 'one', employeeId: '100' }),
    recognition({ id: 'two', employeeId: '200' }),
    recognition({ id: 'three', employeeId: '200' }),
    recognition({ id: 'other-month', employeeId: '300', date: '2026-09-01' }),
    recognition({ id: 'bonus', employeeId: '300', type: 'shooting-star' }),
  ]
  assert.equal(getMonthlyDrawingEntries(records, 'SchoolA', '2026-08').length, 3)
  assert.deepEqual(drawMonthlyAllStar(records, 'SchoolA', '2026-08', 0), {
    employeeId: '100', entryCount: 1, totalEntries: 3,
  })
  assert.deepEqual(drawMonthlyAllStar(records, 'SchoolA', '2026-08', 0.99), {
    employeeId: '200', entryCount: 2, totalEntries: 3,
  })
})

test('a Star of the Day cannot be recorded without saying why they shine', () => {
  const base = {
    employeeId: '123',
    locationId: 'SchoolA',
    type: 'star-of-day',
    date: '2026-08-20',
    criteria: ['Service'],
  }

  assert.throws(() => createRecognitionRecord({ ...base, note: '' }), /why they shine/i)
  assert.throws(() => createRecognitionRecord({ ...base, note: '   ' }), /why they shine/i)
  assert.equal(
    createRecognitionRecord({ ...base, note: 'Covered a line alone at lunch.' }).note,
    'Covered a line alone at lunch.'
  )
})

test('nominations and shout-outs stay lighter-weight than a daily star', () => {
  assert.equal(requiresStarMessage('star-of-day'), true)
  for (const type of ['shooting-star', 'star-shout-out', 'warren-employee-month', 'all-star-of-month']) {
    assert.equal(requiresStarMessage(type), false)
  }
  // A nomination with no message still records.
  assert.equal(createRecognitionRecord({
    employeeId: '123',
    locationId: 'SchoolA',
    type: 'shooting-star',
    date: '2026-08-20',
    criteria: ['Taking initiative to learn new skills or tasks'],
    note: '',
  }).note, '')
})

test('submitting building is recorded so the district can see who is giving stars', () => {
  const record = createRecognitionRecord({
    employeeId: '123',
    locationId: 'SchoolA',
    type: 'star-of-day',
    date: '2026-08-20',
    criteria: ['Service'],
    note: 'Great service.',
    recognizedByLocationId: 'WarrenCnHS',
  })
  assert.equal(record.recognizedByLocationId, 'WarrenCnHS')

  const locationMap = { WarrenCnHS: { name: 'Warren Central HS' } }
  assert.equal(submitterLocationLabel(record, locationMap), 'Warren Central HS')
  assert.equal(submitterLocationLabel({ recognizedByLocationId: 'district' }), 'District admin')
  assert.equal(submitterLocationLabel({}), 'Not recorded')
})

test('submission counts group earned stars by the building that gave them', () => {
  const records = [
    { type: 'star-of-day', recognizedByLocationId: 'A' },
    { type: 'star-of-day', recognizedByLocationId: 'A' },
    { type: 'star-of-day', recognizedByLocationId: 'B' },
    // Nominations are not earned stars, so they do not count here.
    { type: 'shooting-star', recognizedByLocationId: 'B' },
  ]

  assert.deepEqual(getSubmissionCountsByLocation(records), [
    { locationId: 'A', count: 2 },
    { locationId: 'B', count: 1 },
  ])
})
