import { useState } from 'react'
import { useAuth } from './PinGate.jsx'
import { LOCATIONS } from '../data/locations.js'
import { addEmployee } from '../data/employeeLocations.js'
import { T_SHIRT_SIZE_SUGGESTIONS } from '../data/employeeFields.js'
import { rosterActionMode } from '../data/approvalRequests.js'
import { submitRequest } from '../data/approvalStore.js'

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  position: '',
  location: '',
  service_date: '',
  birthdate: '',
  t_shirt_size: '',
}

export default function AddEmployeeModal({ open, onClose, onAdded, defaultLocation = '' }) {
  const access = useAuth()
  const mode = rosterActionMode(access)
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, location: defaultLocation }))
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  if (!open) return null

  if (sent) {
    return (
      <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
        <button type="button" className="absolute inset-0 bg-black/45" onClick={onClose} aria-label="Close" />
        <div role="dialog" aria-modal="true" className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-5">
          <h2 className="text-lg font-bold text-emerald-800">Sent to Liz for review</h2>
          <p className="mt-1 text-sm text-gray-600">
            {form.first_name} {form.last_name} has not been added to the roster. Liz sees this in Change requests and the
            record is created only if she approves it.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const update = (field, value) => {
    setForm(current => ({ ...current, [field]: value }))
    setError('')
  }

  const handleSubmit = event => {
    event.preventDefault()
    try {
      if (mode === 'request') {
        if (!String(form.first_name || '').trim() || !String(form.last_name || '').trim()) {
          throw new Error('First and last name are required.')
        }
        submitRequest({
          type: 'add',
          employeeName: `${form.first_name.trim()} ${form.last_name.trim()}`,
          summary: `${form.position || 'No job title'} · ${LOCATIONS.find(l => l.id === form.location)?.name || form.location || 'No school'}`,
          payload: { ...form },
          requestedBy: access.displayName,
        })
        setError('')
        setSent(true)
        return
      }
      const employee = addEmployee(form)
      setForm(EMPTY_FORM)
      setError('')
      onAdded(employee)
    } catch (submitError) {
      setError(submitError.message || 'Unable to add employee.')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <button type="button" className="absolute inset-0 bg-black/45" onClick={onClose} aria-label="Close add employee form" />
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-employee-title"
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="p-5 border-b border-gray-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 id="add-employee-title" className="text-lg font-bold text-gray-900">Add employee</h2>
            <p className="text-xs text-gray-500 mt-1">
              {mode === 'request'
                ? 'Sends the new employee to Liz for review. Nothing is added to the roster until she approves it.'
                : 'Creates an active employee card in the shared roster.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="First name" value={form.first_name} onChange={value => update('first_name', value)} required />
          <Field label="Last name" value={form.last_name} onChange={value => update('last_name', value)} required />
          <Field label="Position" value={form.position} onChange={value => update('position', value)} />
          <label className="block">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</span>
            <select
              value={form.location}
              onChange={event => update('location', event.target.value)}
              required
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            >
              <option value="">Choose a location</option>
              {[...LOCATIONS].sort((a, b) => a.sort - b.sort).map(location => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </label>
          <Field label="Birthday (MM-DD)" value={form.birthdate} onChange={value => update('birthdate', value)} placeholder="11-06" />
          <Field label="Service date" type="date" value={form.service_date} onChange={value => update('service_date', value)} />
          <Field label="T-shirt size" value={form.t_shirt_size} onChange={value => update('t_shirt_size', value)} placeholder="Example: XL" list="t-shirt-sizes" />
          <datalist id="t-shirt-sizes">
            {T_SHIRT_SIZE_SUGGESTIONS.map(size => <option key={size} value={size} />)}
          </datalist>
          {error && <p className="sm:col-span-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">
            {mode === 'request' ? 'Send to Liz for review' : 'Add employee'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '', list }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        list={list}
        className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  )
}
