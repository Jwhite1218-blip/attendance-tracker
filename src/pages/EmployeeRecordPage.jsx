import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../components/PinGate.jsx'
import { getEmployeeByKey } from '../data/employeeLocations.js'
import { LOCATION_MAP } from '../data/locations.js'
import EmployeeDetail from './EmployeeDetail.jsx'

export default function EmployeeRecordPage() {
  const { employeeId } = useParams()
  const navigate = useNavigate()
  const { role, locationId, dataVersion } = useAuth()
  const [recordVersion, setRecordVersion] = useState(0)

  const employee = useMemo(
    () => getEmployeeByKey(employeeId, { includeInactive: role === 'admin' }),
    [employeeId, role, dataVersion, recordVersion]
  )

  const homePath = role === 'school' ? `/location/${locationId}` : '/'
  if (!employee) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-charcoal-200">That employee card is unavailable for this login.</p>
        <Link to={homePath} className="text-brand-300 hover:underline mt-2 inline-block">Return to attendance</Link>
      </div>
    )
  }

  if (role === 'school' && employee.location !== locationId) {
    return <Navigate to={homePath} replace />
  }

  const school = LOCATION_MAP[employee.location]
  const backPath = employee.location ? `/location/${employee.location}` : '/ledger'

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
      <div className="print:hidden sticky top-16 z-40 -mx-3 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 py-2 mb-4 bg-charcoal-700/95 backdrop-blur-sm border-b border-charcoal-600 flex items-center justify-between gap-2">
        <Link
          to={backPath}
          className="flex items-center gap-2 text-sm font-medium text-brand-300 hover:text-brand-200 transition-colors py-1.5 px-3 rounded-lg hover:bg-charcoal-600"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Back to {school?.name || 'Employee Cards'}</span>
          <span className="sm:hidden">Back</span>
        </Link>
        <div className="flex items-center gap-2 text-xs text-charcoal-200 truncate">
          <Link to="/ledger" className="hover:text-brand-300 hidden sm:inline">Employee Cards</Link>
          <span className="hidden sm:inline">/</span>
          <span className="truncate">{employee.first_name} {employee.last_name}</span>
        </div>
      </div>

      <EmployeeDetail
        employee={employee}
        onEmployeeUpdate={() => setRecordVersion(version => version + 1)}
        onStatusChange={() => navigate(backPath)}
      />
    </div>
  )
}
