// Find one person and open their card.
//
// Lifted out of the Attendance tab on 2026-10-26, when Liz asked a
// building's own tracker to carry the same search: "make this similar to
// the admin page, same format with the employee card search". Two copies of
// a picker would have been two sets of filtering rules to keep in step, and
// the one on the tracker would have been the one that quietly fell behind.
//
// The caller passes the people it is willing to show — the whole district
// from the Attendance tab, one kitchen from a tracker — so this component
// never decides who a login may see. That stays with the server and the
// page above it.

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { ATTENDANCE_SEVERITY_CLASS, attendanceSeverity } from '../data/hrFlags.js'

function employeeKey(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

export default function EmployeeCardPicker({
  employees,
  // When set, the school is fixed and shown as a label rather than a
  // dropdown — a building's tracker is already about one building.
  lockedLocationId = null,
  className = '',
}) {
  const [search, setSearch] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(lockedLocationId || '')
  const [selectedKey, setSelectedKey] = useState('')

  const schoolOptions = useMemo(() => {
    const counts = {}
    employees.forEach(employee => {
      if (employee.location) counts[employee.location] = (counts[employee.location] || 0) + 1
    })
    return LOCATIONS
      .filter(location => counts[location.id])
      .sort((left, right) => left.sort - right.sort)
      .map(location => ({ ...location, count: counts[location.id] }))
  }, [employees])

  const filteredEmployees = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return employees
      .filter(employee => !selectedLocation || employee.location === selectedLocation)
      .filter(employee => !normalizedSearch || (
        `${employee.first_name} ${employee.last_name}`.toLowerCase().includes(normalizedSearch)
        || employeeKey(employee).toLowerCase().includes(normalizedSearch)
      ))
      .sort((left, right) => (
        `${left.last_name} ${left.first_name}`.localeCompare(`${right.last_name} ${right.first_name}`)
      ))
  }, [employees, search, selectedLocation])

  useEffect(() => {
    if (!filteredEmployees.some(employee => employeeKey(employee) === selectedKey)) {
      setSelectedKey(employeeKey(filteredEmployees[0]))
    }
  }, [filteredEmployees, selectedKey])

  const selectedEmployee = filteredEmployees.find(employee => employeeKey(employee) === selectedKey) || null

  return (
    <section className={`bg-white rounded-xl border border-gray-200 p-4 sm:p-5 ${className}`} aria-labelledby="employee-card-picker">
      <div className="mb-4">
        <h2 id="employee-card-picker" className="text-sm font-semibold text-gray-900">Choose an employee</h2>
        <p className="text-xs text-gray-400 mt-1">Attendance edits, comments, employee details, and both year views are consolidated on one card.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="employee-card-school" className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">School</label>
          {lockedLocationId ? (
            <div id="employee-card-school" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 font-medium">
              {LOCATION_MAP[lockedLocationId]?.name || lockedLocationId}
            </div>
          ) : (
            <div className="relative">
              <select
                id="employee-card-school"
                value={selectedLocation}
                onChange={event => {
                  setSelectedLocation(event.target.value)
                  setSelectedKey('')
                }}
                className="w-full appearance-none text-sm font-semibold border-2 border-brand-400 rounded-lg pl-3 pr-9 py-2 bg-brand-50 text-brand-800 hover:bg-brand-100 focus:outline-none focus:ring-2 focus:ring-brand-300 cursor-pointer"
              >
                <option value="">All Schools</option>
                {schoolOptions.map(location => (
                  <option key={location.id} value={location.id}>{location.name} ({location.count})</option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="employee-card-search" className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Search</label>
          <input
            id="employee-card-search"
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Name or personnel ID"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="employee-card-select" className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Employee</label>
        <select
          id="employee-card-select"
          value={selectedKey}
          onChange={event => setSelectedKey(event.target.value)}
          disabled={!filteredEmployees.length}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 disabled:bg-gray-50 disabled:text-gray-400"
        >
          {!filteredEmployees.length && <option value="">No matching employees</option>}
          {filteredEmployees.map(employee => (
            <option key={employeeKey(employee)} value={employeeKey(employee)}>
              {employee.last_name}, {employee.first_name} — {LOCATION_MAP[employee.location]?.shortName || employee.location || 'Unassigned'}
            </option>
          ))}
        </select>
      </div>

      {selectedEmployee && (
        <div className="mt-5 rounded-xl border border-brand-200 bg-brand-50/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-brand-700">{selectedEmployee.first_name?.[0]}{selectedEmployee.last_name?.[0]}</span>
            </div>
            <div className="min-w-0">
              <p className={`font-semibold truncate ${ATTENDANCE_SEVERITY_CLASS[attendanceSeverity(selectedKey)]}`}>
                {selectedEmployee.first_name} {selectedEmployee.last_name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {selectedEmployee.position || 'Position not listed'} · {LOCATION_MAP[selectedEmployee.location]?.name || selectedEmployee.location || 'Unassigned'}
              </p>
            </div>
          </div>
          <Link
            to={`/employee/${encodeURIComponent(selectedKey)}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Open employee card
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}
    </section>
  )
}
