import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildingRecognitionSummary,
  buildingMonthlyRecipients,
  schoolYearMonthKeys,
  toStarCardEntries,
  topLeaderboardEntries,
  RECOGNITION_TYPES,
  recognitionAccent,
  RECOGNITION_CRITERIA,
  CRITERION_LABELS,
  criterionLabel,
} from './recognitionStore.js'

const star = (employeeId, date, locationId, extra = {}) => ({
  id: `${employeeId}-${date}`, type: 'star-of-day', employeeId, date, locationId, ...extra,
})

// --- leaderboard cap --------------------------------------------------------

test('the leaderboard is cut to ten', () => {
  const entries = Array.from({ length: 34 }, (_, index) => ({ count: 34 - index }))
  assert.equal(topLeaderboardEntries(entries).length, 10)
})

test('a shorter board is left alone', () => {
  const entries = [{ count: 3 }, { count: 1 }]
  assert.equal(topLeaderboardEntries(entries).length, 2)
})

test('people tied at the cut are all kept', () => {
  // Three people on 5 stars share tenth place. Dropping two of them because of
  // an alphabetical tiebreak would read as the board being wrong.
  const entries = [
    ...Array.from({ length: 9 }, (_, index) => ({ count: 20 - index })),
    { count: 5 }, { count: 5 }, { count: 5 },
    { count: 4 },
  ]
  const top = topLeaderboardEntries(entries)
  assert.equal(top.length, 12)
  assert.equal(top.at(-1).count, 5)
  assert.ok(!top.some(entry => entry.count === 4))
})

test('a board where everyone is tied is not truncated mid-tie', () => {
  const entries = Array.from({ length: 15 }, () => ({ count: 1 }))
  assert.equal(topLeaderboardEntries(entries).length, 15)
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
  // A kitchen that recognised nobody is the useful signal; leaving it out of
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

test('a building nobody has recognised returns nothing rather than throwing', () => {
  assert.deepEqual(buildingMonthlyRecipients([], 2026, 'StonyBrkMS'), [])
  assert.deepEqual(buildingMonthlyRecipients(null, 2026, null), [])
})
