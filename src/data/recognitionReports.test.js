import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRecognitionCountsReport,
  buildRecognitionReport,
  filterRecognitionsForReport,
  recognitionReportFilename,
  recognitionReportMonths,
} from './recognitionReports.js'
import { reportToCsv } from './customReports.js'

function award(overrides = {}) {
  return {
    id: 'rec-1',
    employeeId: '900',
    locationId: 'CrestonMS',
    type: 'star-of-day',
    date: '2026-10-05',
    criteria: ['Service'],
    otherReason: '',
    note: '',
    sourceName: '',
    recognizedBy: 'Liz Schmitt',
    ...overrides,
  }
}

const ROSTER = {
  900: { first_name: 'Dana', last_name: 'Reyes', position: 'Food Service Worker' },
}
const resolve = id => ROSTER[String(id)] || null

test('an empty filter list means every one of them, not none', () => {
  const records = [
    award({ id: 'a', locationId: 'CrestonMS', type: 'star-of-day' }),
    award({ id: 'b', locationId: 'LowellES', type: 'ace-buck' }),
  ]
  assert.equal(filterRecognitionsForReport(records, { startYear: 2026 }).length, 2)
})

test('the three filters narrow independently and together', () => {
  const records = [
    award({ id: 'a', locationId: 'CrestonMS', type: 'star-of-day', date: '2026-10-05' }),
    award({ id: 'b', locationId: 'CrestonMS', type: 'ace-buck', date: '2026-10-06' }),
    award({ id: 'c', locationId: 'LowellES', type: 'star-of-day', date: '2026-10-07' }),
    award({ id: 'd', locationId: 'CrestonMS', type: 'star-of-day', date: '2026-11-02' }),
  ]
  const ids = options => filterRecognitionsForReport(records, { startYear: 2026, ...options }).map(r => r.id)

  assert.deepEqual(ids({ locationIds: ['CrestonMS'] }), ['a', 'b', 'd'])
  assert.deepEqual(ids({ types: ['star-of-day'] }), ['a', 'c', 'd'])
  assert.deepEqual(ids({ monthKey: '2026-10' }), ['a', 'b', 'c'])
  assert.deepEqual(ids({ locationIds: ['CrestonMS'], types: ['star-of-day'], monthKey: '2026-10' }), ['a'])
})

test('a report runs over one school year, so last June stays out of this one', () => {
  const records = [
    award({ id: 'a', date: '2026-06-30' }),
    award({ id: 'b', date: '2026-07-01' }),
    award({ id: 'c', date: '2027-06-30' }),
    award({ id: 'd', date: '2027-07-01' }),
  ]
  assert.deepEqual(
    filterRecognitionsForReport(records, { startYear: 2026 }).map(r => r.id),
    ['b', 'c'],
  )
})

test('rows are ordered by date so the export reads as a diary', () => {
  const records = [
    award({ id: 'late', date: '2026-10-20' }),
    award({ id: 'early', date: '2026-08-01' }),
    award({ id: 'middle', date: '2026-09-15' }),
  ]
  assert.deepEqual(
    filterRecognitionsForReport(records, { startYear: 2026 }).map(r => r.id),
    ['early', 'middle', 'late'],
  )
})

test('an award to somebody no longer on the roster still exports', () => {
  const report = buildRecognitionReport([award({ employeeId: '404' })], resolve, { startYear: 2026 })
  assert.equal(report.rows.length, 1)
  // Named as a former employee, not by the payroll number.
  assert.equal(report.rows[0].employee, 'Former employee')
  assert.equal(report.rows[0].position, '')
})

test('a row carries the school, the award and the reason in readable words', () => {
  const report = buildRecognitionReport([award()], resolve, { startYear: 2026 })
  assert.deepEqual(report.rows[0], {
    date: '2026-10-05',
    school: 'Creston MS',
    employee: 'Dana Reyes',
    position: 'Food Service Worker',
    award: 'Star of the Day',
    reasons: 'Service',
    given_by: 'Liz Schmitt',
    source: '',
    note: '',
  })
})

// "Other" on its own tells a reader nothing; the typed reason is the point.
test('a free-text reason is exported beside the criterion, not instead of it', () => {
  const report = buildRecognitionReport(
    [award({ criteria: ['Other'], otherReason: 'Covered two kitchens during the outage' })],
    resolve,
    { startYear: 2026 },
  )
  assert.equal(report.rows[0].reasons, 'Other; Covered two kitchens during the outage')
})

test('the export is a CSV the spreadsheet opens, commas and all', () => {
  const report = buildRecognitionReport(
    [award({ note: 'Stayed late, again' })],
    resolve,
    { startYear: 2026 },
  )
  const csv = reportToCsv(report)
  const [header, row] = csv.split('\r\n')
  assert.equal(header, 'Date,School,Employee,Position,Award,Reason,Given by,Nominated by,Note')
  assert.ok(row.endsWith('"Stayed late, again"'), row)
})

test('months run newest first across the school year', () => {
  const months = recognitionReportMonths(2026)
  assert.equal(months.length, 12)
  assert.equal(months[0].key, '2027-06')
  assert.equal(months[11].key, '2026-07')
  assert.equal(months[11].label, 'July 2026')
})

test('the filename says which period and award it holds', () => {
  assert.equal(
    recognitionReportFilename({ startYear: 2026 }),
    'recognition-report-2026-27-school-year.csv',
  )
  assert.equal(
    recognitionReportFilename({ startYear: 2026, monthKey: '2026-10', types: ['ace-buck'] }),
    'recognition-report-2026-10-ace-buck.csv',
  )
})

// --- counts and rankings (district administrators, 2026-11-11) --------------

const PEOPLE = {
  901: { first_name: 'Ana', last_name: 'Vale', position: 'Cook', location: 'LibertyPkE' },
  902: { first_name: 'Ben', last_name: 'Cole', position: 'Food Service Worker', location: 'LibertyPkE' },
  903: { first_name: 'Cara', last_name: 'Dunn', position: 'Food Service Worker', location: 'CrestonMS' },
  904: { first_name: 'Dee', last_name: 'Fox', position: 'Cook', location: 'CrestonMS' },
}
const COUNT_RECORDS = [
  award({ id: 'a1', employeeId: '901', locationId: 'LibertyPkE', date: '2026-10-27', recognizedBy: 'Liberty Park Manager', recognizedByLocationId: 'LibertyPkE', createdAt: '2026-10-27T15:00:00Z' }),
  award({ id: 'a2', employeeId: '901', locationId: 'LibertyPkE', date: '2026-10-28', recognizedBy: 'Liberty Park Manager', recognizedByLocationId: 'LibertyPkE', createdAt: '2026-10-28T15:00:00Z' }),
  award({ id: 'a3', employeeId: '901', locationId: 'LibertyPkE', date: '2026-10-29', recognizedBy: 'Liberty Park Manager', recognizedByLocationId: 'LibertyPkE', createdAt: '2026-10-29T15:00:00Z' }),
  award({ id: 'b1', employeeId: '902', locationId: 'LibertyPkE', date: '2026-10-06', recognizedBy: 'Marlene', recognizedByLocationId: 'district', createdAt: '2026-10-20T15:00:00Z' }),
  award({ id: 'b2', employeeId: '902', locationId: 'LibertyPkE', type: 'star-shout-out', date: '2026-10-07', recognizedBy: 'marlene ', recognizedByLocationId: 'district', createdAt: '2026-10-07T15:00:00Z' }),
  award({ id: 'c1', employeeId: '903', locationId: 'CrestonMS', date: '2026-10-08', recognizedBy: 'Marlene', recognizedByLocationId: 'district', createdAt: '2026-10-08T15:00:00Z' }),
  award({ id: 'c2', employeeId: '903', locationId: 'CrestonMS', type: 'ace-buck', date: '2026-10-09', recognizedBy: 'Marlene', recognizedByLocationId: 'district', createdAt: '2026-10-09T15:00:00Z' }),
]
const countsFor = (view, options = {}, sortBy) => buildRecognitionCountsReport(
  COUNT_RECORDS,
  { resolveEmployee: id => PEOPLE[String(id)] || null, staffByLocation: { LibertyPkE: 4, CrestonMS: 5 } },
  { startYear: 2026, ...options },
  { view, sortBy },
)
const column = (report, id) => report.rows.map(row => row[id])

test('by person: counts per award type, a total, and a rank', () => {
  const report = countsFor('person')
  assert.deepEqual(column(report, 'employee'), ['Ana Vale', 'Ben Cole', 'Cara Dunn'])
  assert.deepEqual(column(report, 'total'), [3, 2, 2])
  assert.deepEqual(column(report, 'count:star-of-day'), [3, 1, 1])
  assert.deepEqual(column(report, 'count:star-shout-out'), [0, 1, 0])
  assert.equal(report.columns[0].id, 'rank')
})

test('people level on a count share a rank, and the next rank skips', () => {
  const report = countsFor('person')
  assert.deepEqual(column(report, 'rank'), [1, 2, 2])
  const byBucks = countsFor('person', {}, 'count:ace-buck')
  assert.deepEqual(column(byBucks, 'employee'), ['Cara Dunn', 'Ana Vale', 'Ben Cole'])
  assert.deepEqual(column(byBucks, 'rank'), [1, 2, 2])
})

test('only the award types chosen get a column, and only they are counted', () => {
  const report = countsFor('person', { types: ['star-of-day'] })
  const ids = report.columns.map(item => item.id)
  assert.ok(ids.includes('count:star-of-day'))
  assert.ok(!ids.includes('count:star-shout-out'))
  assert.deepEqual(column(report, 'total'), [3, 1, 1])
})

test('by building: coverage and per-head use the staff there now', () => {
  const report = countsFor('building')
  const liberty = report.rows.find(row => row.school === 'Liberty Park Elementary')
  assert.equal(liberty.staff, 4)
  assert.equal(liberty.people, 2)
  assert.equal(liberty.coverage, 50)
  assert.equal(liberty.total, 5)
  assert.equal(liberty.per_staff, 1.3)
  assert.equal(report.rows[0].school, 'Liberty Park Elementary')
})

test('by who submitted: one row per name and login, with the patterns worth seeing', () => {
  const report = countsFor('submitter')
  // "marlene " and "Marlene" from the same login are one submitter.
  assert.equal(report.rows.length, 2)
  const marlene = report.rows.find(row => row.submitter === 'Marlene')
  assert.equal(marlene.login, 'District admin')
  assert.equal(marlene.total, 4)
  assert.equal(marlene.people, 2)
  assert.equal(marlene.most_to_one, 2)
  assert.equal(marlene.entered_late, 1)
  assert.equal(marlene.final_week, 0)
  const liberty = report.rows.find(row => row.submitter === 'Liberty Park Manager')
  assert.equal(liberty.login, 'Liberty Park Elementary')
  assert.equal(liberty.most_to_one, 3)
  // 27, 28 and 29 October are all in the month's last seven days.
  assert.equal(liberty.final_week, 100)
})

test('an unknown column to rank by falls back to the total', () => {
  assert.equal(countsFor('person', {}, 'nonsense').sortBy, 'total')
  assert.equal(countsFor('person', {}, 'employee').sortBy, 'total')
})

test('a count view exports through the same CSV writer, rank first', () => {
  const [header] = reportToCsv(countsFor('person', { types: ['star-of-day'] })).split('\r\n')
  assert.equal(header, 'Rank,Employee,School,Position,Stars of the Day,Total')
  assert.equal(
    recognitionReportFilename({ startYear: 2026, monthKey: '2026-10' }, 'submitter'),
    'recognition-report-2026-10-by-submitter.csv',
  )
})
