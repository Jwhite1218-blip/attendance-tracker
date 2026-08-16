import { useState } from 'react'
import { LOCATIONS } from '../data/locations.js'
import { getEmployeesWithEffectiveLocations, transferEmployee, revertTransfer } from '../data/employeeLocations.js'

export default function TransferModal({ employee, onClose, onTransferred }) {
  const [selectedLocation, setSelectedLocation] = useState('')
  const empKey = employee?.kronos_id || employee?.id
  const currentLoc = employee?.location
  const currentLocInfo = LOCATIONS.find(l => l.id === currentLoc)

  if (!employee) return null

  const handleTransfer = () => {
    if (!selectedLocation) return
    transferEmployee(empKey, selectedLocation)
    onTransferred?.()
    onClose()
  }

  const handleRevert = () => {
    revertTransfer(empKey)
    onTransferred?.()
    onClose()
  }

  // Get count of employees currently at each location
  const allEmps = getEmployeesWithEffectiveLocations()
  const locCounts = {}
  allEmps.forEach(e => {
    const loc = e.location || 'Unknown'
    locCounts[loc] = (locCounts[loc] || 0) + 1
  })

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Transfer Employee</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {employee.first_name} {employee.last_name} · ID: {employee.kronos_id}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Currently Assigned</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">
              {currentLocInfo?.name || currentLoc || 'Unassigned'}
              {employee.isTransferred && (
                <span className="ml-2 text-xs text-amber-600 font-medium">(Transferred from {employee.originalLocation})</span>
              )}
            </p>
          </div>

          <label className="text-sm font-medium text-gray-700 block mb-2">Transfer to:</label>
          <select
            value={selectedLocation}
            onChange={e => setSelectedLocation(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 mb-3"
          >
            <option value="">Select a location...</option>
            {LOCATIONS
              .filter(l => l.id !== currentLoc && locCounts[l.id])
              .sort((a, b) => a.sort - b.sort)
              .map(l => (
                <option key={l.id} value={l.id}>
                  {l.name} ({locCounts[l.id] || 0} staff)
                </option>
              ))}
          </select>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleTransfer}
              disabled={!selectedLocation}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Transfer Employee
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>

          {employee.isTransferred && (
            <button
              onClick={handleRevert}
              className="w-full mt-2 text-xs text-gray-400 hover:text-red-500"
            >
              ↩ Revert to original location ({LOCATIONS.find(l => l.id === employee.originalLocation)?.name || employee.originalLocation})
            </button>
          )}

          <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
            Transfers are temporary coverage moves — the employee keeps their original home location in the system. Use this when a building is short-staffed and needs coverage.
          </p>
        </div>
      </div>
    </div>
  )
}
