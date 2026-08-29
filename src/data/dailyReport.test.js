import assert from 'node:assert/strict'
import test from 'node:test'
import { installTestBrowserStorage } from './testBrowserStorage.js'
import { buildDailyReportRows, buildDailyReportSheetRows, getTodayDateKey } from './dailyReport.js'

installTestBrowserStorage()

function seedAttendance(empId, dateKey, code, note) {
  const year = dateKey.slice(0, 4)
  localStorage.setItem(`att-emp-${empId}-${year}`, JSON.stringify({
    [dateKey]: { code, date: dateKey, ...(note ? { note } : {}) },
  }))
}

test('getTodayDateKey formats using local date parts, not UTC', () => {
  const localMidnight = new Date(2026, 0, 5) // Jan 5 2026, local time
  assert.equal(getTodayDateKey(localMidnight), '2026-01-05')
})

test('buildDailyReportRows only includes employees with a coded exception today, with the comment attached', () => {
  localStorage.clear()
  seedAttendance('100', '2026-08-29', 'UNEX', 'Called in sick')
  seedAttendance('200', '2026-08-28', 'NCNS') // different day, excluded

  const employees = [
    { id: 1, kronos_id: '100', first_name: 'Amanda', last_name: 'Allen', location: 'WarrenCnHS' },
    { id: 2, kronos_id: '200', first_name: 'Katya', last_name: 'Alvarez', location: 'StonyBrkMS' },
    { id: 3, kronos_id: '300', first_name: 'No', last_name: 'Record', location: 'WarrenCnHS' },
  ]

  const rows = buildDailyReportRows(employees, '2026-08-29')

  assert.equal(rows.length, 1)
  assert.equal(rows[0].employeeName, 'Amanda Allen')
  assert.equal(rows[0].code, 'UNEX')
  assert.equal(rows[0].locationName, 'Warren Central HS')
  assert.equal(rows[0].note, 'Called in sick')
})

test('buildDailyReportRows sorts by school sort order, then employee name', () => {
  localStorage.clear()
  seedAttendance('100', '2026-08-29', 'LI')
  seedAttendance('200', '2026-08-29', 'EO')

  const employees = [
    { id: 1, kronos_id: '100', first_name: 'Zed', last_name: 'Zephyr', location: 'StonyBrkMS' },
    { id: 2, kronos_id: '200', first_name: 'Amy', last_name: 'Adams', location: 'WarrenCnHS' },
  ]

  const rows = buildDailyReportRows(employees, '2026-08-29')

  assert.deepEqual(rows.map(row => row.employeeName), ['Amy Adams', 'Zed Zephyr'])
})

test('buildDailyReportSheetRows shapes rows for a spreadsheet', () => {
  const sheetRows = buildDailyReportSheetRows([
    { locationName: 'Warren Central HS', employeeName: 'Amanda Allen', code: 'UNEX', codeLabel: 'UNEXCUSED ABSENCE, CALL IN', note: 'Called in sick' },
  ])

  assert.deepEqual(sheetRows, [{
    Location: 'Warren Central HS',
    Employee: 'Amanda Allen',
    Code: 'UNEX',
    Description: 'UNEXCUSED ABSENCE, CALL IN',
    Comment: 'Called in sick',
  }])
})
