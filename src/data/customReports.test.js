import test from 'node:test'
import assert from 'node:assert/strict'
import { buildEmployeeReport, reportToCsv, summarizeTShirtSizes } from './customReports.js'

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
  const report = buildEmployeeReport(employees, ['CrestonMS'], ['employee_id', 'last_name', 'school'])
  assert.deepEqual(report.columns.map(column => column.id), ['employee_id', 'last_name', 'school'])
  assert.deepEqual(report.rows, [
    { employee_id: '200', last_name: 'Baker, Jr.', school: 'Creston MS' },
    { employee_id: '300', last_name: 'Clark', school: 'Creston MS' },
  ])
})

test('creates Excel-compatible CSV with escaped values', () => {
  const report = buildEmployeeReport(employees, ['CrestonMS'], ['employee_id', 'last_name'])
  assert.equal(reportToCsv(report), 'Employee ID,Last Name\r\n200,"Baker, Jr."\r\n300,Clark')
})

test('summarizes shirt sizes and keeps missing sizes visible', () => {
  assert.deepEqual(summarizeTShirtSizes(employees), [
    { size: 'M', count: 1 },
    { size: 'XL', count: 1 },
    { size: 'Not provided', count: 1 },
  ])
})
