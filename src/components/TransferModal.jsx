import { useState } from 'react'
import { useAuth } from './PinGate.jsx'
import { LOCATIONS } from '../data/locations.js'
import { getEmployeesWithEffectiveLocations, transferEmployee } from '../data/employeeLocations.js'
import { rosterActionMode } from '../data/approvalRequests.js'
import { submitRequest } from '../data/approvalStore.js'

export default function TransferModal({ employee, onClose, onTransferred }) {
  const access = useAuth()
  const { displayName } = access
  const mode = rosterActionMode(access)
  const [selectedLocation, setSelectedLocation] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const empKey = employee?.kronos_id || employee?.id
  const currentLoc = employee?.location
  const currentLocInfo = LOCATIONS.find(l => l.id === currentLoc)

  if (!employee) return null

  const handleTransfer = () => {
    if (!selectedLocation) return
    if (mode === 'request') {
      try {
        submitRequest({
          type: 'transfer',
          empId: empKey,
          employeeName: `${employee.first_name} ${employee.last_name}`,
          summary: `${LOCATIONS.find(l => l.id === currentLoc)?.name || currentLoc || 'Unassigned'} → ${LOCATIONS.find(l => l.id === selectedLocation)?.name || selectedLocation}`,
          payload: { to: selectedLocation },
          baseline: { location: currentLoc || '' },
          requestedBy: displayName,
        })
        setSent(true)
      } catch (submitError) {
        setError(submitError.message || 'Unable to send this request.')
      }
      return
    }
    transferEmployee(empKey, selectedLocation, displayName)
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
                {employee.first_name} {employee.last_name}
              </p>
              <p className="text-xs text-amber-600 font-medium mt-1">This permanently changes their home school.</p>
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
            </p>
          </div>

          <label className="text-sm font-medium text-gray-700 block mb-2">Transfer to:</label>
          <select
            value={selectedLocation}
            onChange={e => setSelectedLocation(e.target.value)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 mb-3"
          >
            <option value="">Select a location...</option>
            {/* Every school except the one they are in. Filtering on a staff
                count used to hide any building that happened to be empty,
                which made it impossible to be the first transfer into a new
                or seasonally closed kitchen. */}
            {LOCATIONS
              .filter(l => l.id !== currentLoc)
              .sort((a, b) => a.sort - b.sort)
              .map(l => (
                <option key={l.id} value={l.id}>
                  {l.name} ({locCounts[l.id] || 0} staff)
                </option>
              ))}
          </select>

          {error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}

          {sent ? (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-sm font-semibold text-emerald-800">Sent to Liz for review</p>
              <p className="mt-1 text-xs text-emerald-700">
                Nobody has moved yet. The transfer happens only if Liz approves it.
              </p>
              <button
                onClick={onClose}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleTransfer}
                  disabled={!selectedLocation}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {mode === 'request' ? 'Send to Liz for review' : 'Transfer Employee'}
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>

              <p className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                This is a permanent change to the employee's assigned school, not temporary coverage. It should be rare — use it only when someone is actually moving schools.
                {mode === 'request' && ' Liz reviews every transfer before it takes effect.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
