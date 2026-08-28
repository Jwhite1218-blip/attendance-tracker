import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import employees from './employees.json' with { type: 'json' }
import { LOCATIONS } from './locations.js'

function employeeKey(employee) {
  return String(employee.kronos_id || employee.id || '').trim()
}

test('the source roster has unique IDs and complete location assignments', () => {
  const locationIds = new Set(LOCATIONS.map(location => location.id))
  const employeeIds = employees.map(employeeKey)

  assert.ok(employees.length > 0, 'The source roster must not be empty.')
  assert.equal(new Set(employeeIds).size, employeeIds.length, 'Employee IDs must be unique.')

  employees.forEach(employee => {
    const label = employee.display_name || employeeKey(employee) || 'unknown employee'
    assert.ok(employeeKey(employee), `${label} is missing an employee ID.`)
    assert.ok(String(employee.first_name || '').trim(), `${label} is missing a first name.`)
    assert.ok(String(employee.last_name || '').trim(), `${label} is missing a last name.`)
    assert.ok(locationIds.has(employee.location), `${label} has an unknown location: ${employee.location || '(blank)'}.`)
  })
})

test('the desktop building header stays in table flow so it cannot cover the first employee', () => {
  const locationView = readFileSync(new URL('../pages/LocationView.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(locationView, /<thead className="[^"]*\bsticky\b/)
  assert.match(locationView, /<thead className="relative z-20 shadow-sm">/)
})
