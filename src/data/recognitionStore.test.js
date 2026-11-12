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
  earnsDailyStar,
  getDailyStarCount,
  getAceBuckCount,
  buildingRecognitionSummary,
  employeeStarsByLocation,
  recognitionEarnsStar,
  toStarCardEntries,
  dailyStarsInMonth,
  dailyStarsInSchoolYear,
  aceBucksInSchoolYear,
  recognitionsOfTypeInSchoolYear,
  addRecognitionGroup,
  editEmployeeOfMonth,
  editMonthlyWinner,
  employeeOfMonthClash,
  employeesOfMonth,
  removeEmployeeOfMonth,
  redrawExcludedEmployeeIds,
  removeMonthlyWinner,
  replaceMonthlyWinner,
  setAsideEntries,
} from './recognitionStore.js'
import { configureClientAccess, flushPendingWrites } from './sharedStore.js'
import { installTestBrowserStorage } from './testBrowserStorage.js'

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

// Jon, 2026-10-30: Liz needs to be able to redraw the monthly winner.
function monthlyWinnerRecord(overrides = {}) {
  return recognition({
    id: 'winner-1',
    employeeId: '200',
    type: 'all-star-of-month',
    date: '2026-08-31',
    monthKey: '2026-08',
    criteria: [],
    note: 'Selected from 3 building entries; 2 belonged to this employee.',
    createdAt: '2026-08-29T15:00:00.000Z',
    ...overrides,
  })
}

test('a redraw leaves out the winner, everyone set aside before, and the manager pool', () => {
  const winner = monthlyWinnerRecord({
    redraw: { setAside: [{ employeeId: '100', setAsideAt: '2026-08-29T14:00:00.000Z', setAsideBy: 'Liz' }] },
  })
  assert.deepEqual(
    [...redrawExcludedEmployeeIds(winner, new Set(['900']))].sort(),
    ['100', '200', '900']
  )
  // A month that was never drawn excludes only what the caller passed.
  assert.deepEqual([...redrawExcludedEmployeeIds(null, new Set(['900']))], ['900'])
})

test('the person set aside cannot come straight back, however many stars they hold', () => {
  const records = [
    recognition({ id: 'a1', employeeId: '200' }),
    recognition({ id: 'a2', employeeId: '200' }),
    recognition({ id: 'a3', employeeId: '200' }),
    recognition({ id: 'b1', employeeId: '300' }),
  ]
  const excluded = redrawExcludedEmployeeIds(monthlyWinnerRecord())
  for (const randomValue of [0, 0.25, 0.5, 0.75, 0.99]) {
    assert.deepEqual(drawMonthlyAllStar(records, 'SchoolA', '2026-08', randomValue, excluded), {
      employeeId: '300', entryCount: 1, totalEntries: 1,
    })
  }
  // With the only other candidate set aside too, there is nobody left.
  const everyone = redrawExcludedEmployeeIds(monthlyWinnerRecord({
    redraw: { setAside: [{ employeeId: '300', setAsideAt: '2026-08-29T14:00:00.000Z', setAsideBy: 'Liz' }] },
  }))
  assert.equal(drawMonthlyAllStar(records, 'SchoolA', '2026-08', 0, everyone), null)
})

test('only a drawing carries a redraw history, and it is cleaned on the way in', () => {
  const setAside = [{ employeeId: ' 200 ', drawnAt: '', setAsideAt: '2026-08-29T15:00:00.000Z', setAsideBy: ' Liz ', extra: 'dropped' }]
  const drawn = createRecognitionRecord({
    employeeId: '300', locationId: 'SchoolA', type: 'all-star-of-month',
    date: '2026-08-31', monthKey: '2026-08', criteria: [], redraw: { setAside },
  })
  assert.deepEqual(drawn.redraw, {
    setAside: [{ employeeId: '200', setAsideAt: '2026-08-29T15:00:00.000Z', setAsideBy: 'Liz' }],
  })
  assert.deepEqual(setAsideEntries(drawn), drawn.redraw.setAside)

  const star = createRecognitionRecord({
    employeeId: '300', locationId: 'SchoolA', type: 'star-of-day', date: '2026-08-20',
    criteria: ['Service'], note: 'Covered the line', redraw: { setAside },
  })
  assert.equal(Object.hasOwn(star, 'redraw'), false)

  // A month drawn once has no history at all, not an empty one.
  const once = createRecognitionRecord({
    employeeId: '300', locationId: 'SchoolA', type: 'all-star-of-month',
    date: '2026-08-31', monthKey: '2026-08', criteria: [],
  })
  assert.equal(Object.hasOwn(once, 'redraw'), false)
  assert.deepEqual(setAsideEntries(once), [])
})

test('a redraw replaces the winner in one save and remembers who was set aside', async () => {
  installTestBrowserStorage()
  configureClientAccess({ role: 'admin', canEditAttendance: true, canEditRecognition: true })
  const earlier = { employeeId: '100', setAsideAt: '2026-08-29T14:00:00.000Z', setAsideBy: 'Liz' }
  const winner = monthlyWinnerRecord({ redraw: { setAside: [earlier] } })
  const star = recognition({ id: 'star-1', employeeId: '300' })
  localStorage.setItem('all-star-recognition-v1', JSON.stringify({ [winner.id]: winner, [star.id]: star }))

  const sent = []
  globalThis.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body || '{}')
    sent.push(body)
    return { ok: true, status: 200, json: async () => ({ ok: true, value: JSON.parse(localStorage.getItem(body.key)) }) }
  }

  const record = await replaceMonthlyWinner(
    winner,
    { employeeId: '300', date: '2026-08-31', criteria: [], note: 'Selected from 1 building entry; 1 belonged to this employee.' },
    { setAsideBy: 'Liz', setAsideAt: '2026-08-30T16:00:00.000Z' }
  )

  assert.equal(record.employeeId, '300')
  assert.equal(record.locationId, 'SchoolA')
  assert.equal(record.monthKey, '2026-08')
  assert.deepEqual(record.redraw.setAside, [
    earlier,
    { employeeId: '200', drawnAt: '2026-08-29T15:00:00.000Z', setAsideAt: '2026-08-30T16:00:00.000Z', setAsideBy: 'Liz' },
  ])

  // One request: the old winner removed and the new one set together, so the
  // month is never without a winner or holding two.
  const recognitionWrites = sent.filter(body => body.key === 'all-star-recognition-v1')
  assert.equal(recognitionWrites.length, 1)
  assert.deepEqual(recognitionWrites[0].mutation.remove, ['winner-1'])
  assert.deepEqual(Object.keys(recognitionWrites[0].mutation.set), [record.id])

  const stored = JSON.parse(localStorage.getItem('all-star-recognition-v1'))
  assert.deepEqual(Object.keys(stored).sort(), [record.id, 'star-1'].sort())
})

test('a redraw is refused when there is no recorded winner', () => {
  assert.throws(() => replaceMonthlyWinner(null, { employeeId: '300' }), /no recorded winner/)
  assert.throws(
    () => replaceMonthlyWinner(recognition(), { employeeId: '300' }),
    /no recorded winner/
  )
})

// Jon, 2026-10-30: "she needs to be able to edit those fully she put one in
// the wrong month."
function installRecognitionServer(records) {
  installTestBrowserStorage()
  configureClientAccess({ role: 'admin', canEditAttendance: true, canEditRecognition: true })
  localStorage.setItem('all-star-recognition-v1', JSON.stringify(
    Object.fromEntries(records.map(record => [record.id, record]))
  ))
  const sent = []
  globalThis.fetch = async (_url, options = {}) => {
    const body = JSON.parse(options.body || '{}')
    sent.push(body)
    return { ok: true, status: 200, json: async () => ({ ok: true, value: JSON.parse(localStorage.getItem(body.key)) }) }
  }
  return () => sent.filter(body => body.key === 'all-star-recognition-v1')
}

test('a winner put in the wrong month moves, keeping who it is and when it was drawn', async () => {
  const setAside = [{ employeeId: '100', setAsideAt: '2026-10-29T14:00:00.000Z', setAsideBy: 'Liz' }]
  const winner = monthlyWinnerRecord({ date: '2026-10-31', monthKey: '2026-10', redraw: { setAside } })
  const sentRecognition = installRecognitionServer([winner])

  const record = await editMonthlyWinner(
    winner,
    { monthKey: '2026-09' },
    { updatedBy: 'Liz', updatedAt: '2026-10-30T17:00:00.000Z' }
  )

  assert.equal(record.id, winner.id)
  assert.equal(record.employeeId, '200')
  assert.equal(record.locationId, 'SchoolA')
  assert.equal(record.monthKey, '2026-09')
  // Dated the last day of its new month, as a fresh draw would be.
  assert.equal(record.date, '2026-09-30')
  assert.equal(record.createdAt, winner.createdAt)
  assert.equal(record.note, winner.note)
  assert.deepEqual(record.redraw, { setAside })
  assert.equal(record.updatedAt, '2026-10-30T17:00:00.000Z')
  assert.equal(record.updatedBy, 'Liz')

  const writes = sentRecognition()
  assert.equal(writes.length, 1)
  assert.deepEqual(Object.keys(writes[0].mutation.set), [winner.id])
  assert.deepEqual(writes[0].mutation.remove, [])
})

test('a winner can be given to somebody else or moved to another building', async () => {
  const winner = monthlyWinnerRecord()
  installRecognitionServer([winner])

  const record = await editMonthlyWinner(
    winner,
    { employeeId: '300', locationId: 'SchoolB', note: 'Recorded by the district.' },
    { updatedBy: 'Liz' }
  )
  assert.equal(record.employeeId, '300')
  assert.equal(record.locationId, 'SchoolB')
  assert.equal(record.monthKey, '2026-08')
  assert.equal(record.note, 'Recorded by the district.')
})

test('a winner cannot be moved onto a month that already has one', async () => {
  const winner = monthlyWinnerRecord({ id: 'august', monthKey: '2026-08' })
  const september = monthlyWinnerRecord({ id: 'september', employeeId: '300', monthKey: '2026-09', date: '2026-09-30' })
  const sentRecognition = installRecognitionServer([winner, september])

  assert.throws(() => editMonthlyWinner(winner, { monthKey: '2026-09' }), /already has a recorded winner/)
  assert.throws(() => editMonthlyWinner(winner, { monthKey: '2026-13' }), /valid month/)
  assert.equal(sentRecognition().length, 0, 'nothing was sent')
  // The same building in another month, or another building in the same
  // month, is fine.
  const moved = await editMonthlyWinner(winner, { monthKey: '2026-09', locationId: 'SchoolB' })
  assert.equal(moved.locationId, 'SchoolB')
})

test('removing a winner leaves the month empty, ready to be drawn again', async () => {
  const winner = monthlyWinnerRecord()
  const star = recognition({ id: 'star-1', employeeId: '300' })
  const sentRecognition = installRecognitionServer([winner, star])

  await removeMonthlyWinner(winner)

  const writes = sentRecognition()
  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0].mutation.set, {})
  assert.deepEqual(writes[0].mutation.remove, [winner.id])
  assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem('all-star-recognition-v1'))), ['star-1'])
  assert.throws(() => removeMonthlyWinner(star), /no recorded winner/)
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

test('the school-year star count keeps July through June and drops everything else', () => {
  const records = [
    recognition({ id: 'july', date: '2026-07-01' }),
    recognition({ id: 'june', date: '2027-06-30' }),
    recognition({ id: 'before', date: '2026-06-30' }),
    recognition({ id: 'after', date: '2027-07-01' }),
    recognition({ id: 'buck', date: '2026-11-02', type: 'ace-buck' }),
    recognition({ id: 'shout', date: '2026-11-03', type: 'star-shout-out' }),
    recognition({ id: 'other-school', date: '2026-11-04', locationId: 'SchoolB' }),
  ]
  assert.deepEqual(
    dailyStarsInSchoolYear(records, 2026, ['SchoolA']).map(record => record.id),
    ['july', 'june'],
  )
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

// --- one card, a star each, 2026-10-27 -----------------------------------
//
// Liz: "if 5 out of 10 employees in the kitchen did something great and you
// want to reward the group with one recognition card but it would mark an
// individual star each."

test('a group award carries its id; a single award does not', () => {
  const made = createRecognitionRecord({
    employeeId: '1', locationId: 'CrestonMS', type: 'star-of-day',
    date: '2026-10-27', criteria: ['Service'], note: 'Covered the rush together.',
    groupId: 'group-7',
  })
  assert.equal(made.groupId, 'group-7')

  const alone = createRecognitionRecord({
    employeeId: '1', locationId: 'CrestonMS', type: 'star-of-day',
    date: '2026-10-27', criteria: ['Service'], note: 'Great day.',
  })
  assert.equal(Object.hasOwn(alone, 'groupId'), false, 'absent, not empty')
})

test('five stars in one group print one card naming all five', () => {
  const names = { 1: 'Ann Alpha', 2: 'Bo Beta', 3: 'Cy Gamma', 4: 'Di Delta', 5: 'Ed Epsilon' }
  const group = ['1', '2', '3', '4', '5'].map((employeeId, index) => recognition({
    id: `g${index}`, employeeId, type: 'star-of-day', date: '2026-10-27',
    groupId: 'group-7', criteria: ['Teamwork'], note: 'Covered the rush together.',
  }))

  const cards = toStarCardEntries(group, id => names[id])
  assert.equal(cards.length, 1, 'one card, not five')
  assert.equal(cards[0].name, 'Ann Alpha, Bo Beta, Cy Gamma, Di Delta, Ed Epsilon')
  assert.deepEqual(cards[0].names, Object.values(names))
  assert.equal(cards[0].message, 'Covered the rush together.')
})

test('a single star is unchanged, and keeps its place beside a group', () => {
  const names = { 1: 'Ann Alpha', 2: 'Bo Beta', 9: 'Zed Omega' }
  const records = [
    recognition({ id: 'solo-1', employeeId: '9', type: 'star-of-day', date: '2026-10-26' }),
    recognition({ id: 'g1', employeeId: '1', type: 'star-of-day', date: '2026-10-27', groupId: 'g' }),
    recognition({ id: 'g2', employeeId: '2', type: 'star-of-day', date: '2026-10-27', groupId: 'g' }),
  ]
  const cards = toStarCardEntries(records, id => names[id])
  assert.deepEqual(cards.map(card => card.name), ['Zed Omega', 'Ann Alpha, Bo Beta'])
  // A single card is untouched: no names array, so nothing that reads one
  // card has to know groups exist.
  assert.equal(Object.hasOwn(cards[0], 'names'), false)
  assert.deepEqual(cards[1].names, ['Ann Alpha', 'Bo Beta'])
})

// Each person earns their own star, so the counts and the drawing must see
// five people — only the printing is shared.
test('a group of five is five stars, not one', () => {
  const group = ['1', '2', '3', '4', '5'].map((employeeId, index) => recognition({
    id: `g${index}`, employeeId, type: 'star-of-day', date: '2026-10-27', groupId: 'group-7',
  }))
  assert.equal(group.filter(earnsDailyStar).length, 5)
  for (const employeeId of ['1', '2', '3', '4', '5']) {
    assert.equal(getEmployeeStarCount(group, employeeId, 2026), 1, `${employeeId} earns their own`)
  }
})

// Two different group awards on the same day must not merge into one card.
test('two separate group awards print two cards', () => {
  const names = { 1: 'Ann', 2: 'Bo', 3: 'Cy', 4: 'Di' }
  const records = [
    recognition({ id: 'a1', employeeId: '1', type: 'star-of-day', date: '2026-10-27', groupId: 'morning' }),
    recognition({ id: 'a2', employeeId: '2', type: 'star-of-day', date: '2026-10-27', groupId: 'morning' }),
    recognition({ id: 'b1', employeeId: '3', type: 'star-of-day', date: '2026-10-27', groupId: 'lunch' }),
    recognition({ id: 'b2', employeeId: '4', type: 'star-of-day', date: '2026-10-27', groupId: 'lunch' }),
  ]
  assert.deepEqual(
    toStarCardEntries(records, id => names[id]).map(card => card.name),
    ['Ann, Bo', 'Cy, Di'],
  )
})

// Jon, 2026-10-30: "liz wants to be able to give multiple ACE bucks at once."
test('several leaders get a Coach Buck each, in one save', async () => {
  const sentRecognition = installRecognitionServer([])
  const records = addRecognitionGroup(
    {
      type: 'ace-buck',
      date: '2026-10-30',
      criteria: ['Safety Leader'],
      note: '',
      recognizedBy: 'Liz',
      recognizedByLocationId: 'district',
    },
    [
      { employeeId: 'mgr-1', locationId: 'CrestonMS' },
      { employeeId: 'mgr-2', locationId: 'LowellES' },
      // Ticked twice is still one buck.
      { employeeId: 'mgr-1', locationId: 'CrestonMS' },
    ],
  )

  assert.equal(records.length, 2)
  assert.deepEqual(records.map(record => record.type), ['ace-buck', 'ace-buck'])
  // Each buck stays with its own leader's building.
  assert.deepEqual(records.map(record => record.locationId), ['CrestonMS', 'LowellES'])
  assert.ok(records[0].groupId)
  assert.equal(records[0].groupId, records[1].groupId)
  assert.equal(getAceBuckCount(records, 'mgr-1', 2026), 1)
  assert.equal(getAceBuckCount(records, 'mgr-2', 2026), 1)

  await flushPendingWrites()
  const writes = sentRecognition()
  assert.equal(writes.length, 1)
  assert.deepEqual(Object.keys(writes[0].mutation.set).sort(), records.map(record => record.id).sort())
})

// Jon, 2026-10-30: "Employee of the month is supposed to be one employee
// from the whole district."
function employeeOfMonthRecord(overrides = {}) {
  return recognition({
    id: 'eom-1',
    employeeId: '200',
    type: 'warren-employee-month',
    date: '2026-10-15',
    criteria: ['Qualified through All-Star of the Month'],
    note: 'Ran the line all month.',
    createdAt: '2026-10-15T15:00:00.000Z',
    ...overrides,
  })
}

test('the Employee of the Month belongs to the month of its date, district-wide', () => {
  const october = employeeOfMonthRecord()
  const otherBuilding = employeeOfMonthRecord({ id: 'eom-2', employeeId: '300', locationId: 'SchoolB', date: '2026-10-28' })
  const september = employeeOfMonthRecord({ id: 'eom-3', date: '2026-09-30' })
  const allStar = monthlyWinnerRecord({ date: '2026-10-31', monthKey: '2026-10' })
  const records = [october, otherBuilding, september, allStar]

  // Another building in the same month is the same month: there is one for
  // the whole district, not one per building.
  assert.deepEqual(employeesOfMonth(records, '2026-10').map(record => record.id), ['eom-1', 'eom-2'])
  assert.equal(employeeOfMonthClash(records, '2026-10', 'eom-1').id, 'eom-2')
  assert.equal(employeeOfMonthClash([october, september], '2026-10', 'eom-1'), null)
  // The building All-Star is a different award and never counts.
  assert.equal(employeeOfMonthClash([allStar], '2026-10'), null)
})

test('an Employee of the Month put in the wrong month moves, and can change hands', async () => {
  const award = employeeOfMonthRecord()
  const sentRecognition = installRecognitionServer([award])

  const moved = await editEmployeeOfMonth(
    award,
    { date: '2026-09-30', employeeId: '300', locationId: 'SchoolB', note: 'Covered two kitchens.' },
    { updatedBy: 'Liz', updatedAt: '2026-10-30T18:00:00.000Z' }
  )

  assert.equal(moved.id, award.id)
  assert.equal(moved.createdAt, award.createdAt)
  assert.equal(moved.type, 'warren-employee-month')
  assert.equal(moved.date, '2026-09-30')
  assert.equal(moved.monthKey, null)
  assert.equal(moved.employeeId, '300')
  assert.equal(moved.locationId, 'SchoolB')
  assert.deepEqual(moved.criteria, award.criteria)
  assert.equal(moved.note, 'Covered two kitchens.')
  assert.equal(moved.updatedBy, 'Liz')

  const writes = sentRecognition()
  assert.equal(writes.length, 1)
  assert.deepEqual(Object.keys(writes[0].mutation.set), [award.id])
})

test('an Employee of the Month cannot be moved onto a month that has one', () => {
  const october = employeeOfMonthRecord()
  const september = employeeOfMonthRecord({ id: 'eom-sept', employeeId: '300', date: '2026-09-15' })
  const sentRecognition = installRecognitionServer([october, september])

  assert.throws(() => editEmployeeOfMonth(october, { date: '2026-09-02' }), /already has an Employee of the Month/)
  assert.throws(() => editEmployeeOfMonth(october, { criteria: [] }), /at least one reason/)
  assert.equal(sentRecognition().length, 0, 'nothing was sent')
})

test('removing the Employee of the Month leaves the month open for another', async () => {
  const award = employeeOfMonthRecord()
  const star = recognition({ id: 'star-1' })
  const sentRecognition = installRecognitionServer([award, star])

  await removeEmployeeOfMonth(award)

  assert.deepEqual(sentRecognition()[0].mutation.remove, [award.id])
  assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem('all-star-recognition-v1'))), ['star-1'])
  assert.throws(() => removeEmployeeOfMonth(star), /no Employee of the Month/)
})
