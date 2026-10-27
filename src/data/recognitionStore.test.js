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
  earnsDailyStar,
  getDailyStarCount,
  getAceBuckCount,
  buildingRecognitionSummary,
  employeeStarsByLocation,
  recognitionEarnsStar,
  dailyStarsInMonth,
  aceBucksInSchoolYear,
  recognitionsOfTypeInSchoolYear,
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
    otherReason: '',
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

// Liz, 2026-09-01: nominations now carry the same message requirement as a daily
// star. Both can be given for "Other", which says nothing without the note.
test('hand-written awards all require a star card message', () => {
  for (const type of ['star-of-day', 'shooting-star', 'star-shout-out']) {
    assert.equal(requiresStarMessage(type), true)
  }
  // The monthly draw writes its own note, so it stays exempt.
  for (const type of ['warren-employee-month', 'all-star-of-month']) {
    assert.equal(requiresStarMessage(type), false)
  }
})

test('a nomination without a message is refused', () => {
  assert.throws(() => createRecognitionRecord({
    employeeId: '123',
    locationId: 'SchoolA',
    type: 'shooting-star',
    date: '2026-08-20',
    criteria: ['Taking initiative to learn new skills or tasks'],
    note: '',
  }), /star card message/i)
})

test('nomination surfaces accept Other as a reason', () => {
  for (const type of ['shooting-star', 'star-shout-out']) {
    const record = createRecognitionRecord({
      employeeId: '123',
      locationId: 'SchoolA',
      type,
      date: '2026-08-20',
      criteria: ['Other'],
      note: 'Stayed late to reset the serving line after a water shut-off.',
    })
    assert.deepEqual(record.criteria, ['Other'])
  }
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

test('a Star of the Day given for Other has to say what the other reason was', () => {
  const base = {
    employeeId: '123',
    locationId: 'SchoolA',
    type: 'star-of-day',
    date: '2026-08-20',
    criteria: ['Other'],
    note: 'She stayed late to cover the serving line.',
  }

  // "Other" alone prints as a blank on a card somebody is handed.
  assert.throws(() => createRecognitionRecord(base), /what the other reason was/)

  const record = createRecognitionRecord({ ...base, otherReason: 'Covered a double shift' })
  assert.equal(record.otherReason, 'Covered a double shift')
})

test('the other line is dropped when Other is not one of the reasons', () => {
  const record = createRecognitionRecord({
    employeeId: '123',
    locationId: 'SchoolA',
    type: 'star-of-day',
    date: '2026-08-20',
    criteria: ['Service'],
    otherReason: 'left over from an earlier edit',
    note: 'Great service during lunch.',
  })
  assert.equal(record.otherReason, '')
})

test('a nomination can still be given for Other without the extra line', () => {
  // Those surfaces carry the reason in the required message instead, and
  // nothing about them is printed on a card.
  const record = createRecognitionRecord({
    employeeId: '123',
    locationId: 'SchoolA',
    type: 'star-shout-out',
    date: '2026-08-20',
    criteria: ['Other'],
    note: 'A parent wrote in to say thank you.',
  })
  assert.equal(record.criteria.includes('Other'), true)
})

// Found on 2026-10-19 while previewing what awarding an ACE Coach Buck would
// do, before any had been given out. A Buck "earns", so it passed
// recognitionEarnsStar and was counted as a Star of the Day by every figure
// that uses it — including the employee record, where one award showed up
// twice and could have pushed somebody to the next star level on a currency
// they had not earned.
test('an ACE Coach Buck is never counted as a Star of the Day', () => {
  const buck = {
    id: 'b1', employeeId: 'mgr-1', locationId: 'CrestonMS', type: 'ace-buck',
    date: '2026-10-05', criteria: ['People & Culture'], note: 'Led the line.',
  }
  const star = {
    id: 's1', employeeId: 'mgr-1', locationId: 'CrestonMS', type: 'star-of-day',
    date: '2026-10-06', criteria: ['Service'], note: 'Covered a shift.',
  }
  const records = [buck, star]

  assert.equal(earnsDailyStar(buck), false)
  assert.equal(earnsDailyStar(star), true)
  // Both still "earn" — a Buck is an award, not a nomination.
  assert.equal(recognitionEarnsStar(buck), true)

  // The manager's own record: one star, one Buck, never two of either.
  assert.equal(getEmployeeStarCount(records, 'mgr-1', 2026), 1)
  assert.equal(getDailyStarCount(records, 'mgr-1', 2026), 1)
  assert.equal(getAceBuckCount(records, 'mgr-1', 2026), 1)

  // And the star level is reached on stars alone.
  assert.equal(getEmployeeStarCount([buck, buck, buck, buck, buck], 'mgr-1', 2026), 0)
})

test('a Buck does not inflate the building figures that say Star of the Day only', () => {
  const records = [
    { id: 'b1', employeeId: 'mgr-1', locationId: 'CrestonMS', type: 'ace-buck', date: '2026-10-05' },
    { id: 's1', employeeId: 'emp-1', locationId: 'CrestonMS', type: 'star-of-day', date: '2026-10-06' },
  ]

  const [building] = buildingRecognitionSummary(records, 2026, ['CrestonMS'])
  assert.equal(building.total, 1, 'the star, not the Buck')
  assert.equal(building.months['2026-10'], 1)

  assert.deepEqual(
    employeeStarsByLocation(records, 'mgr-1'),
    [],
    'a Buck is not a star earned at a school'
  )
})

// The two dashboard tiles Liz asked for on 2026-10-26. Both are district
// figures, so the thing that must not drift is what they exclude: a star
// tile that quietly counted nominations or Bucks would read high all year
// and nobody would know which number was wrong.
test('the month star tile counts only daily stars, only this month', () => {
  const records = [
    recognition({ id: 'a', date: '2026-10-02' }),
    recognition({ id: 'b', date: '2026-10-29' }),
    recognition({ id: 'c', date: '2026-09-30' }),
    recognition({ id: 'd', date: '2026-11-01' }),
    recognition({ id: 'e', date: '2026-10-15', type: 'shooting-star' }),
    recognition({ id: 'f', date: '2026-10-15', type: 'star-shout-out' }),
    recognition({ id: 'g', date: '2026-10-15', type: 'ace-buck' }),
  ]
  assert.equal(dailyStarsInMonth(records, '2026-10').length, 2)
})

test('the month star tile follows the school pills, and all district means all', () => {
  const records = [
    recognition({ id: 'a', date: '2026-10-02', locationId: 'SchoolA' }),
    recognition({ id: 'b', date: '2026-10-03', locationId: 'SchoolB' }),
    recognition({ id: 'c', date: '2026-10-04', locationId: 'SchoolC' }),
  ]
  assert.equal(dailyStarsInMonth(records, '2026-10', []).length, 3)
  assert.equal(dailyStarsInMonth(records, '2026-10', ['SchoolA']).length, 1)
  assert.equal(dailyStarsInMonth(records, '2026-10', ['SchoolA', 'SchoolC']).length, 2)
})

test('the ACE Buck tile counts the school year, not the calendar year', () => {
  const records = [
    recognition({ id: 'a', date: '2026-09-10', type: 'ace-buck' }),
    recognition({ id: 'b', date: '2027-05-10', type: 'ace-buck' }),
    recognition({ id: 'c', date: '2026-06-30', type: 'ace-buck' }),
    recognition({ id: 'd', date: '2027-09-01', type: 'ace-buck' }),
    recognition({ id: 'e', date: '2026-09-11' }),
  ]
  // September and the following May belong together; the June before and
  // the September after belong to the years either side.
  assert.equal(aceBucksInSchoolYear(records, 2026).length, 2)
  assert.equal(aceBucksInSchoolYear(records, 2025).length, 1)
})

test('the ACE Buck tile narrows with the school pills', () => {
  const records = [
    recognition({ id: 'a', date: '2026-09-10', type: 'ace-buck', locationId: 'SchoolA' }),
    recognition({ id: 'b', date: '2026-10-10', type: 'ace-buck', locationId: 'SchoolB' }),
  ]
  assert.equal(aceBucksInSchoolYear(records, 2026, ['SchoolB']).length, 1)
})

// The nomination tiles, added 2026-10-26 beside the two that count earned
// awards. A nomination is not a star, so these must never pick one up.
test('the nomination tiles count one type each, over the school year', () => {
  const records = [
    recognition({ id: 'a', date: '2026-09-02', type: 'shooting-star' }),
    recognition({ id: 'b', date: '2027-04-02', type: 'shooting-star' }),
    recognition({ id: 'c', date: '2026-06-02', type: 'shooting-star' }),
    recognition({ id: 'd', date: '2026-09-03', type: 'star-shout-out' }),
    recognition({ id: 'e', date: '2026-09-04' }),
    recognition({ id: 'f', date: '2026-09-05', type: 'ace-buck' }),
  ]
  assert.deepEqual(
    recognitionsOfTypeInSchoolYear(records, 'shooting-star', 2026).map(r => r.id),
    ['a', 'b'],
  )
  assert.deepEqual(
    recognitionsOfTypeInSchoolYear(records, 'star-shout-out', 2026).map(r => r.id),
    ['d'],
  )
})

// A tile and its drill-down read the same list, so the number on the tile
// is the number of rows that open under it. This is the property that
// stops the two drifting apart.
test('every dashboard recognition tile hands its drill-down the rows it counted', () => {
  const records = [
    recognition({ id: 'a', date: '2026-10-02', locationId: 'SchoolA' }),
    recognition({ id: 'b', date: '2026-10-03', locationId: 'SchoolB' }),
    recognition({ id: 'c', date: '2026-10-04', type: 'ace-buck', locationId: 'SchoolA' }),
  ]
  const stars = dailyStarsInMonth(records, '2026-10', ['SchoolA'])
  assert.equal(stars.length, 1)
  assert.equal(stars[0].id, 'a')
  const bucks = aceBucksInSchoolYear(records, 2026, ['SchoolA'])
  assert.equal(bucks.length, 1)
  assert.equal(bucks[0].id, 'c')
})
