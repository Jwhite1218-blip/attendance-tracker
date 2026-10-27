import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../components/PinGate.jsx'
import { getEmployeesWithEffectiveLocations } from '../data/employeeLocations.js'
import { LOCATIONS } from '../data/locations.js'
import AttendanceCodeReference from '../components/AttendanceCodeReference.jsx'
import EmployeeCardPicker from '../components/EmployeeCardPicker.jsx'

export default function LedgerView() {
  const { role, locationId: myLocationId, dataVersion } = useAuth()

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

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Employee Cards</h1>
        <p className="text-sm text-charcoal-200 mt-1">
          Find an employee, then open their card. Or open a whole school&apos;s attendance tracker below.
        </p>
      </div>

      <EmployeeCardPicker
        employees={employees}
        lockedLocationId={role === 'school' ? myLocationId : null}
      />

      {schoolOptions.length > 0 && (
      <section className="mt-6" aria-labelledby="school-trackers">
        <h2 id="school-trackers" className="text-lg font-semibold text-white mb-1">
          {schoolOptions.length === 1 ? 'Attendance tracker' : 'Attendance trackers by school'}
        </h2>
        <p className="text-sm text-charcoal-200 mb-4">Open a whole school&apos;s month at once.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {schoolOptions.map(location => (
            <Link
              key={location.id}
              to={`/location/${location.id}`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:border-brand-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">{location.name}</p>
                  <p className="text-sm text-gray-500 mt-1">{location.type}</p>
                </div>
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{location.id}</span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center">
                    <span className="text-sm font-semibold text-brand-600">{location.count}</span>
                  </div>
                  <span className="text-sm text-gray-500">staff</span>
                </div>
                <svg className="w-5 h-5 text-gray-400 group-hover:text-brand-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      </section>
      )}

      <AttendanceCodeReference className="mt-8" />
    </div>
  )
}
