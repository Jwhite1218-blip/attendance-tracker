import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildingRecognitionSummary,
  getMonthlyDrawingEntries,
  buildingMonthlyRecipients,
  schoolYearMonthKeys,
  toStarCardEntries,
  teamRecognitionCoverage,
  RECOGNITION_TYPES,
  recognitionAccent,
  RECOGNITION_CRITERIA,
  CRITERION_LABELS,
  criterionLabel,
} from './recognitionStore.js'

const star = (employeeId, date, locationId, extra = {}) => ({
  id: `${employeeId}-${date}`, type: 'star-of-day', employeeId, date, locationId, ...extra,
})

// --- team coverage (replaced the leaderboards, 2026-11-11) ------------------

const person = (kronos_id, location = 'X') => ({ kronos_id, location, first_name: kronos_id, last_name: 'Test' })
const coverage = (records, people, monthKey = '2026-10') =>
  teamRecognitionCoverage(records, people, { monthKey, startYear: 2026 })

test('everybody on the team comes back, recognized or not, in the order given', () => {
  const team = [person('cook'), person('worker'), person('lead')]
  const result = coverage([star('worker', '2026-10-03', 'X')], team)
  assert.deepEqual(result.map(entry => entry.employeeId), ['cook', 'worker', 'lead'])
  assert.deepEqual(result.map(entry => entry.recognizedThisMonth), [false, true, false])
})

test('recognized means somebody chose to recognize them, this month', () => {
  const team = ['star', 'shout', 'nominee', 'buck', 'drawn', 'eom', 'lastMonth'].map(id => person(id))
  const records = [
    star('star', '2026-10-01', 'X'),
    { id: 's', type: 'star-shout-out', employeeId: 'shout', date: '2026-10-02', locationId: 'X' },
    { id: 'n', type: 'shooting-star', employeeId: 'nominee', date: '2026-10-03', locationId: 'X' },
    { id: 'b', type: 'ace-buck', employeeId: 'buck', date: '2026-10-04', locationId: 'X' },
    // A drawing and Employee of the Month are outcomes of recognition, not
    // recognition given, so on their own they do not mark anybody.
    { id: 'd', type: 'all-star-of-month', employeeId: 'drawn', date: '2026-10-31', locationId: 'X' },
    { id: 'e', type: 'warren-employee-month', employeeId: 'eom', date: '2026-10-31', locationId: 'X' },
    star('lastMonth', '2026-09-30', 'X'),
  ]
  const recognized = Object.fromEntries(coverage(records, team).map(entry => [entry.employeeId, entry.recognizedThisMonth]))
  assert.deepEqual(recognized, {
    star: true, shout: true, nominee: true, buck: true, drawn: false, eom: false, lastMonth: false,
  })
})

test('last recognized is the latest date this school year, and last year does not count', () => {
  const team = [person('a'), person('b')]
  const records = [
    star('a', '2026-09-12', 'X'),
    star('a', '2026-08-30', 'X'),
    star('b', '2026-05-20', 'X'),
  ]
  const [a, b] = coverage(records, team)
  assert.equal(a.lastRecognized, '2026-09-12')
  assert.equal(b.lastRecognized, null)
})

test('each person gets their own distance to their next level, and no total', () => {
  const records = [1, 2, 3].map(day => star('a', `2026-10-0${day}`, 'X'))
  const [entry] = coverage(records, [person('a')])
  assert.equal(entry.level, null)
  assert.equal(entry.nextLevel.name, 'Bronze Star')
  assert.equal(entry.toNextLevel, 2)
  // Nothing a page could put in a column and sort by.
  assert.ok(!('count' in entry) && !('stars' in entry))
})

test('only stars move somebody toward their next star level', () => {
  const records = [
    star('a', '2026-10-01', 'X'),
    { id: 's', type: 'star-shout-out', employeeId: 'a', date: '2026-10-02', locationId: 'X' },
    { id: 'b', type: 'ace-buck', employeeId: 'a', date: '2026-10-03', locationId: 'X' },
  ]
  const [entry] = coverage(records, [person('a')])
  assert.equal(entry.toNextLevel, 4)
})

// --- building counts --------------------------------------------------------

test('stars are counted per building, by month and for the year', () => {
  const summary = buildingRecognitionSummary([
    star('1', '2026-09-03', 'StonyBrkMS'),
    star('2', '2026-09-20', 'StonyBrkMS'),
    star('3', '2026-10-02', 'StonyBrkMS'),
    star('4', '2026-09-11', 'CrestonMS'),
  ], 2026)

  const stony = summary.find(entry => entry.locationId === 'StonyBrkMS')
  assert.equal(stony.total, 3)
  assert.deepEqual(stony.months, { '2026-09': 2, '2026-10': 1 })
  assert.equal(summary.find(entry => entry.locationId === 'CrestonMS').total, 1)
})

test('buildings are ordered by total, busiest first', () => {
  const summary = buildingRecognitionSummary([
    star('1', '2026-09-03', 'CrestonMS'),
    star('2', '2026-09-04', 'StonyBrkMS'),
    star('3', '2026-09-05', 'StonyBrkMS'),
  ], 2026)
  assert.deepEqual(summary.map(entry => entry.locationId), ['StonyBrkMS', 'CrestonMS'])
})

test('a building with no stars still appears when it is named', () => {
  // A kitchen that recognized nobody is the useful signal; leaving it out of
  // the table hides exactly the thing worth seeing.
  const summary = buildingRecognitionSummary([], 2026, ['StonyBrkMS', 'CrestonMS'])
  assert.equal(summary.length, 2)
  assert.equal(summary[0].total, 0)
})

test('only earned stars count, and only this school year', () => {
  const summary = buildingRecognitionSummary([
    star('1', '2026-09-03', 'StonyBrkMS'),
    { ...star('2', '2026-09-04', 'StonyBrkMS'), type: 'shooting-star' },
    { ...star('3', '2026-09-05', 'StonyBrkMS'), type: 'star-shout-out' },
    star('4', '2026-03-05', 'StonyBrkMS'),
  ], 2026)

  assert.equal(summary.find(entry => entry.locationId === 'StonyBrkMS').total, 1)
})

test('a record with no building or an unreadable date is skipped, not counted wrongly', () => {
  const summary = buildingRecognitionSummary([
    star('1', '2026-09-03', ''),
    star('2', 'not-a-date', 'StonyBrkMS'),
  ], 2026)
  assert.deepEqual(summary.filter(entry => entry.total > 0), [])
})

test('the school year runs July to June', () => {
  const months = schoolYearMonthKeys(2026)
  assert.equal(months.length, 12)
  assert.equal(months[0], '2026-07')
  assert.equal(months[5], '2026-12')
  assert.equal(months[6], '2027-01')
  assert.equal(months.at(-1), '2027-06')
})

// --- bulk card printing -----------------------------------------------------

test('only daily stars become printable cards', () => {
  const entries = toStarCardEntries([
    star('1', '2026-09-03', 'StonyBrkMS', { criteria: ['Teamwork'], note: 'Covered the line.', recognizedBy: 'Stony Brook MS' }),
    { ...star('2', '2026-09-04', 'StonyBrkMS'), type: 'shooting-star' },
  ], id => (id === '1' ? 'Annie Chaney' : null))

  assert.equal(entries.length, 1)
  assert.deepEqual(entries[0], {
    name: 'Annie Chaney',
    date: '2026-09-03',
    criteria: ['Teamwork'],
    otherReason: '',
    message: 'Covered the line.',
    recognizedBy: 'Stony Brook MS',
  })
})

test('a card still prints when the person is no longer on the roster', () => {
  // The star was earned; a later transfer or departure must not blank the card.
  const entries = toStarCardEntries([star('99', '2026-09-03', 'StonyBrkMS')], () => null)
  assert.equal(entries[0].name, '99')
  assert.deepEqual(entries[0].criteria, [])
  assert.equal(entries[0].message, '')
})

// --- recognition accents ----------------------------------------------------

test('every recognition type has its own look', () => {
  const seen = new Set()
  for (const type of RECOGNITION_TYPES) {
    const accent = recognitionAccent(type.id)
    assert.ok(accent.glyph, `${type.id} has no glyph`)
    assert.ok(accent.chip, `${type.id} has no chip styling`)
    // Liz's point was that these must not look alike, so no two may share a mark.
    const signature = `${accent.glyph}|${accent.chip}`
    assert.ok(!seen.has(signature), `${type.id} looks identical to another type`)
    seen.add(signature)
  }
})

test('the accent cannot disagree with whether a star is actually earned', () => {
  // The visual claim and the counting rule come from two places; if they drift,
  // the board tells someone they earned a star that no total will ever show.
  for (const type of RECOGNITION_TYPES) {
    assert.equal(
      recognitionAccent(type.id).earns,
      Boolean(type.earnsStar),
      `${type.id} shows as earning a star but does not count as one`
    )
  }
})

test('an unknown type still gets a usable look', () => {
  const accent = recognitionAccent('not-a-type')
  assert.ok(accent.glyph && accent.chip && accent.mark)
})

// --- Shout-Out wording matches the printed card -----------------------------

test('every Shout-Out reason carries the name from the printed card', () => {
  const reasons = RECOGNITION_CRITERIA['star-shout-out'].filter(value => value !== 'Other')
  for (const value of reasons) {
    const label = criterionLabel(value)
    assert.ok(CRITERION_LABELS[value], `${value} has no card wording`)
    assert.notEqual(label.name, value, `${value} still shows its stored value as the name`)
    assert.ok(label.description, `${value} has no explanation`)
  }
})

test('the reasons read down in the order the card prints them', () => {
  assert.deepEqual(
    RECOGNITION_CRITERIA['star-shout-out'].map(value => criterionLabel(value).name),
    ['Compassionate Service', 'Community Contributor', 'Effective Communicator', 'Resilient Leader', 'Other']
  )
})

test('the card names are keyed by the value already stored on records', () => {
  // The point of keying on the stored string is that nothing recorded has to
  // change and past shout-outs pick up the names too. If a key here ever stops
  // matching an allowed reason, old records quietly lose their name.
  for (const key of Object.keys(CRITERION_LABELS)) {
    assert.ok(
      RECOGNITION_CRITERIA['star-shout-out'].includes(key),
      `${key} is no longer a reason anyone can choose`
    )
  }
})

test('a reason with no card wording still reads as itself', () => {
  assert.equal(criterionLabel('Other').name, 'Other')
  assert.equal(criterionLabel('Taking initiative to learn new skills or tasks').name,
    'Taking initiative to learn new skills or tasks')
})

// --- who got the stars, per building per month ------------------------------

test('a building breaks down into months, and months into people', () => {
  const rows = buildingMonthlyRecipients([
    star('1', '2026-09-03', 'StonyBrkMS'),
    star('1', '2026-09-10', 'StonyBrkMS'),
    star('2', '2026-09-11', 'StonyBrkMS'),
    star('3', '2026-10-02', 'StonyBrkMS'),
    star('4', '2026-09-04', 'CrestonMS'),
  ], 2026, 'StonyBrkMS')

  // Newest month first: the month being asked about is usually this one.
  assert.deepEqual(rows.map(row => row.monthKey), ['2026-10', '2026-09'])

  const september = rows.find(row => row.monthKey === '2026-09')
  assert.equal(september.total, 3)
  assert.deepEqual(september.recipients, [
    { employeeId: '1', count: 2 },
    { employeeId: '2', count: 1 },
  ])
})

test('the breakdown totals agree with the counts table', () => {
  // Two views of the same thing disagreeing is worse than either being absent.
  const records = [
    star('1', '2026-09-03', 'StonyBrkMS'),
    star('1', '2026-09-10', 'StonyBrkMS'),
    star('2', '2026-10-11', 'StonyBrkMS'),
  ]
  const summary = buildingRecognitionSummary(records, 2026).find(e => e.locationId === 'StonyBrkMS')
  const rows = buildingMonthlyRecipients(records, 2026, 'StonyBrkMS')

  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), summary.total)
  for (const row of rows) assert.equal(row.total, summary.months[row.monthKey])
})

test('only that building, only earned stars, only this school year', () => {
  const rows = buildingMonthlyRecipients([
    star('1', '2026-09-03', 'CrestonMS'),
    { ...star('2', '2026-09-04', 'StonyBrkMS'), type: 'shooting-star' },
    star('3', '2026-03-05', 'StonyBrkMS'),
  ], 2026, 'StonyBrkMS')
  assert.deepEqual(rows, [])
})

test('a building nobody has recognized returns nothing rather than throwing', () => {
  assert.deepEqual(buildingMonthlyRecipients([], 2026, 'StonyBrkMS'), [])
  assert.deepEqual(buildingMonthlyRecipients(null, 2026, null), [])
})

// Liz, 2026-10-19, settling the question she had been holding for her team:
// a manager's Star of the Day counts towards their building's total, but
// does not put an entry in that building's monthly drawing.
//
// The two halves are set in different functions and nothing asserted them
// together, so a change to either could quietly undo her decision.
test('a manager\'s star counts for the building but not in its drawing', () => {
  const records = [
    star('mgr-1', '2026-10-05', 'StonyBrkMS'),
    star('emp-1', '2026-10-06', 'StonyBrkMS'),
    star('emp-2', '2026-10-07', 'StonyBrkMS'),
  ]
  const managers = new Set(['mgr-1'])

  const [building] = buildingRecognitionSummary(records, 2026, ['StonyBrkMS'])
  assert.equal(building.total, 3, 'the building is credited with every star earned in it')
  assert.equal(building.months['2026-10'], 3)

  const entries = getMonthlyDrawingEntries(records, 'StonyBrkMS', '2026-10', managers)
  assert.deepEqual(entries.map(entry => entry.employeeId), ['emp-1', 'emp-2'])
})

test('without the manager split every star still draws, as it did before', () => {
  // The split starts in July 2026; earlier months are left exactly as they
  // were so last year's drawings cannot change retrospectively.
  const records = [star('mgr-1', '2026-05-05', 'StonyBrkMS'), star('emp-1', '2026-05-06', 'StonyBrkMS')]
  assert.equal(getMonthlyDrawingEntries(records, 'StonyBrkMS', '2026-05', null).length, 2)
})
