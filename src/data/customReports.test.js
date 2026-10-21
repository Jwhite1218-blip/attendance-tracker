import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPLOYEE_REPORT_FIELDS, buildEmployeeReport, reportToCsv, summarizeTShirtSizes } from './customReports.js'

const employees = [
  {
    id: 1,
    kronos_id: '100',
    first_name: 'Avery',
    last_name: 'Able',
    position: 'Cook',
    location: 'WarrenCnHS',
    birthdate: '08-05',
    t_shirt_size: 'M',
  },
  {
    id: 2,
    kronos_id: '200',
    first_name: 'Bailey',
    last_name: 'Baker, Jr.',
    position: 'Food Service Worker',
    location: 'CrestonMS',
    birthdate: '09-10',
    t_shirt_size: 'XL',
  },
  {
    id: 3,
    kronos_id: '300',
    first_name: 'Casey',
    last_name: 'Clark',
    position: 'Cook',
    location: 'CrestonMS',
    birthdate: '',
    t_shirt_size: '',
  },
]

test('builds a report for only the selected schools and fields', () => {
  const report = buildEmployeeReport(employees, ['CrestonMS'], ['position', 'last_name', 'school'])
  assert.deepEqual(report.columns.map(column => column.id), ['position', 'last_name', 'school'])
  assert.deepEqual(report.rows, [
    { position: 'Food Service Worker', last_name: 'Baker, Jr.', school: 'Creston MS' },
    { position: 'Cook', last_name: 'Clark', school: 'Creston MS' },
  ])
})

test('creates Excel-compatible CSV with escaped values', () => {
  const report = buildEmployeeReport(employees, ['CrestonMS'], ['last_name', 'school'])
  assert.equal(reportToCsv(report), 'Last Name,School\r\n"Baker, Jr.",Creston MS\r\nClark,Creston MS')
})

test('summarizes shirt sizes and keeps missing sizes visible', () => {
  assert.deepEqual(summarizeTShirtSizes(employees), [
    { size: 'M', count: 1 },
    { size: 'XL', count: 1 },
    { size: 'Not provided', count: 1 },
  ])
})

// Liz, 2026-10-20: the payroll number comes out of everything a person can
// see or export. A report column offering it would have put it straight into
// a spreadsheet, which is the furthest it could travel.
test('no report column offers the payroll identifier', () => {
  assert.equal(EMPLOYEE_REPORT_FIELDS.some(field => field.id === 'employee_id'), false)
  const report = buildEmployeeReport(employees, ['CrestonMS'], ['employee_id'])
  assert.deepEqual(report.columns, [], 'an unknown field is ignored rather than guessed at')
})
