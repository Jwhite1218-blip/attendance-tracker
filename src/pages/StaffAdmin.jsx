import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LOCATION_MAP } from '../data/locations.js'
import { getEmployeesWithEffectiveLocations, setEmployeeActive } from '../data/employeeLocations.js'
import { getAllFlaggedEmployees, getAttendanceStageLabel, splitFlaggedByEmploymentStatus } from '../data/hrFlags.js'
import { hasLizAdminAccess } from '../data/futureTools.js'
import AddEmployeeModal from '../components/AddEmployeeModal.jsx'
import { useAuth } from '../components/PinGate.jsx'

// Roster housekeeping lives here rather than on the Dashboard: inactive records
// are looked at rarely, and a departed employee sitting on the front page reads
// like an active concern. The Dashboard keeps a button through to this page.
export default function StaffAdmin() {
  const access = useAuth()
  const navigate = useNavigate()
  const lizAdminAccess = hasLizAdminAccess(access)
  const [directoryVersion, setDirectoryVersion] = useState(0)
  const [showAddEmployee, setShowAddEmployee] = useState(false)

  const refreshDirectory = () => setDirectoryVersion(version => version + 1)

  const allEmployees = getEmployeesWithEffectiveLocations({ includeInactive: true })
  const inactiveEmployees = allEmployees.filter(employee => !employee.active)
  const activeCount = allEmployees.length - inactiveEmployees.length

  // Inactive staff keep their attendance flag but leave the follow-up watch
  // list, so their stage is surfaced here instead — it returns to the main list
  // if they are reactivated.
  const flaggedInactive = splitFlaggedByEmploymentStatus(
    getAllFlaggedEmployees()
      .map(flag => ({ ...flag, employee: allEmployees.find(e => String(e.kronos_id || e.id) === String(flag.empId)) }))
      .filter(entry => entry.employee)
  ).inactive
  const flaggedStatusByEmpKey = new Map(flaggedInactive.map(flag => [String(flag.empId), flag]))

  const openEmployeeRecord = employee => {
    navigate(`/employee/${encodeURIComponent(employee.kronos_id || employee.id)}`)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-6">
        <Link to="/" className="text-xs font-semibold text-white/70 hover:text-white">&larr; Dashboard</Link>
        <h1 className="text-2xl font-bold text-white mt-2">Employee Management</h1>
        <p className="text-sm text-white/60 mt-1">
          Add employees and restore inactive records. Attendance history stays attached to the
          employee, so a reactivated record returns with its full history.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Active Staff</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Inactive Staff</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{inactiveEmployees.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Roster</h2>
            <p className="text-xs text-gray-400 mt-1">
              New employees appear in every building list in alphabetical order.
            </p>
          </div>
          {lizAdminAccess ? (
            <button
              type="button"
              onClick={() => setShowAddEmployee(true)}
              className="self-start px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700"
            >
              + Add employee
            </button>
          ) : (
            <span className="self-start rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-500">
              Roster read-only
            </span>
          )}
        </div>

        {inactiveEmployees.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Inactive employees
              {flaggedInactive.length > 0 && (
                <span className="ml-2 normal-case font-medium text-gray-400">
                  {flaggedInactive.length} with open attendance follow-up
                </span>
              )}
            </p>
            <div className="divide-y divide-gray-100">
              {inactiveEmployees.map(employee => {
                const empKey = employee.kronos_id || employee.id
                const flagged = flaggedStatusByEmpKey.get(String(empKey))
                return (
                  <div key={empKey} className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <button type="button" onClick={() => openEmployeeRecord(employee)} className="text-left group">
                      <p className="text-sm font-semibold text-gray-800 group-hover:text-brand-700 transition-colors">{employee.first_name} {employee.last_name}</p>
                      <p className="text-xs text-gray-400">
                        ID: {employee.kronos_id} · {LOCATION_MAP[employee.location]?.name || employee.location}
                        {employee.inactive_reason ? ` · ${employee.inactive_reason}` : ''}
                        {' · View history'}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">Termination date: {employee.termination_date || 'Not recorded'} · Last day worked: {employee.last_day_worked || 'Not recorded'}</p>
                      {flagged && (
                        <p className="text-xs font-semibold text-amber-700 mt-1">
                          {getAttendanceStageLabel(flagged)} · kept if reactivated
                        </p>
                      )}
                    </button>
                    {lizAdminAccess && (
                      <button
                        type="button"
                        onClick={() => {
                          setEmployeeActive(empKey, true)
                          refreshDirectory()
                        }}
                        className="self-start sm:self-auto px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100">No inactive employee records.</p>
        )}
      </div>

      {showAddEmployee && (
        <AddEmployeeModal
          key={directoryVersion}
          open={showAddEmployee}
          onClose={() => setShowAddEmployee(false)}
          onAdded={() => {
            setShowAddEmployee(false)
            refreshDirectory()
          }}
        />
      )}
    </div>
  )
}
