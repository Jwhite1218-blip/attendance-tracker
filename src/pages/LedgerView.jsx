import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../components/PinGate.jsx'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { LOCATIONS, LOCATION_MAP } from '../data/locations.js'
import { isFlagged } from '../data/hrFlags.js'

function employeeKey(employee) {
  return String(employee?.kronos_id || employee?.id || '')
}

export default function LedgerView() {
  const { role, locationId: myLocationId, dataVersion } = useAuth()
  const [search, setSearch] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(role === 'school' ? myLocationId : '')
  const [selectedKey, setSelectedKey] = useState('')

  const employees = useMemo(
    () => getEmployeesWithEffectiveLocations(),
    [dataVersion]
  )

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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Employee Records</h1>
        <p className="text-sm text-charcoal-200 mt-1">
          Find an employee, then open the same record used from the school dashboard.
        </p>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5" aria-labelledby="employee-record-picker">
        <div className="mb-4">
          <h2 id="employee-record-picker" className="text-sm font-semibold text-gray-900">Choose an employee</h2>
          <p className="text-xs text-gray-400 mt-1">Attendance edits, comments, employee details, and both year views are consolidated in one record.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="employee-record-school" className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">School</label>
            {role === 'school' ? (
              <div id="employee-record-school" className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 font-medium">
                {LOCATION_MAP[myLocationId]?.name || myLocationId}
              </div>
            ) : (
              <select
                id="employee-record-school"
                value={selectedLocation}
                onChange={event => {
                  setSelectedLocation(event.target.value)
                  setSelectedKey('')
                }}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 font-medium"
              >
                <option value="">All Schools</option>
                {schoolOptions.map(location => (
                  <option key={location.id} value={location.id}>{location.name} ({location.count})</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="employee-record-search" className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Search</label>
            <input
              id="employee-record-search"
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Name or personnel ID"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="employee-record-select" className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Employee</label>
          <select
            id="employee-record-select"
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
                <p className={`font-semibold truncate ${isFlagged(selectedKey) ? 'text-red-600' : 'text-gray-900'}`}>
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
              Open employee record
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        )}
      </section>
    </div>
  )
}
