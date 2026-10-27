import test from 'node:test'
import assert from 'node:assert/strict'
import {
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
  assert.equal(report.rows[0].employee, 'Employee 404')
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
