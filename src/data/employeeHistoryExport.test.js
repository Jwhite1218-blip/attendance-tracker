import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildEmployeeHistoryRows,
  buildEmployeeHistorySheetRows,
  buildEmployeeHistoryHeaderRows,
  buildEmployeeHistoryFilename,
} from './employeeHistoryExport.js'

test('buildEmployeeHistoryRows keeps only coded records, sorted by date', () => {
  const attendance = {
    '2026-08-05': { date: '2026-08-05', code: 'LI' },
    '2026-08-01': { date: '2026-08-01', code: 'UNEX', note: 'Called in' },
    '2026-08-03': { date: '2026-08-03' }, // no code — excluded
  }

  const rows = buildEmployeeHistoryRows(attendance)

  assert.deepEqual(rows.map(row => row.date), ['2026-08-01', '2026-08-05'])
})

test('buildEmployeeHistorySheetRows shapes rows for a spreadsheet', () => {
  const sheetRows = buildEmployeeHistorySheetRows([
    { date: '2026-08-01', code: 'UNEX', note: 'Called in sick' },
  ])

  assert.deepEqual(sheetRows, [{
    Date: '2026-08-01',
    Code: 'UNEX',
    Description: 'UNEXCUSED ABSENCE, CALL IN',
    Comment: 'Called in sick',
  }])
})

test('buildEmployeeHistoryHeaderRows identifies the employee and range', () => {
  const employee = { first_name: 'Amanda', last_name: 'Allen', kronos_id: '100', position: 'Cook', location: 'WarrenCnHS' }
  const now = new Date(2026, 7, 29)

  const headerRows = buildEmployeeHistoryHeaderRows(employee, '2025-26', now)

  assert.equal(headerRows[0][0], 'Attendance Ledger — 2025-26')
  assert.equal(headerRows[1][0], 'Amanda Allen · ID: 100')
  assert.match(headerRows[2][0], /Cook/)
  assert.match(headerRows[3][0], /Exported/)
})

test('buildEmployeeHistoryFilename is filesystem-safe and identifies the employee', () => {
  const employee = { first_name: 'Amanda', last_name: "O'Allen", kronos_id: '100' }

  assert.equal(buildEmployeeHistoryFilename(employee, '2025-26'), 'attendance-history-oallen-amanda-2025-26.xlsx')
})
