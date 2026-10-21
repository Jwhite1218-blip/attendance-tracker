import { useState } from 'react'
import { useAuth } from './PinGate.jsx'
import { LOCATIONS } from '../data/locations.js'
import { transferEmployee, updateEmployeeRecord } from '../data/employeeLocations.js'
import { normalizeBirthday, T_SHIRT_SIZE_SUGGESTIONS } from '../data/employeeFields.js'
import { rosterActionMode } from '../data/approvalRequests.js'
import { submitRequest } from '../data/approvalStore.js'

export default function EmployeeEditForm({ employee, onCancel, onSaved }) {
  const access = useAuth()
  const { displayName } = access
  // Liz saves; anybody else sends the same change to her for review.
  const mode = rosterActionMode(access)
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({
    first_name: employee.first_name || '',
    last_name: employee.last_name || '',
    position: employee.position || '',
    location: employee.location || '',
    birthdate: employee.birthdate || '',
    service_date: employee.service_date || '',
    t_shirt_size: employee.t_shirt_size || '',
  })
  const [error, setError] = useState('')

  const update = (field, value) => {
    setForm(current => ({ ...current, [field]: value }))
    setError('')
  }

  const handleSubmit = event => {
    event.preventDefault()
    try {
      if (!form.first_name.trim() || !form.last_name.trim()) throw new Error('First and last name are required.')
      if (!form.location) throw new Error('Choose a location.')
      const empKey = employee.kronos_id || employee.id
      const updates = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        display_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
        position: form.position.trim(),
        job: form.position.trim(),
        birthdate: normalizeBirthday(form.birthdate),
        service_date: form.service_date,
        t_shirt_size: form.t_shirt_size.trim(),
      }

      if (mode === 'request') {
        // Only what actually differs, so Liz reads a short list rather than
        // every field on the card, and so an untouched field cannot overwrite
        // a correction somebody else makes before she decides.
        const changed = Object.fromEntries(
          Object.entries(updates).filter(([field, value]) => String(value ?? '') !== String(employee[field] ?? ''))
        )
        const moving = form.location !== employee.location
        if (!Object.keys(changed).length && !moving) throw new Error('Nothing has been changed.')

        const payload = moving ? { ...changed, location: form.location } : changed
        const baseline = Object.fromEntries(
          Object.keys(payload).map(field => [field, field === 'location' ? employee.location : employee[field] ?? ''])
        )

        submitRequest({
          type: 'edit',
          empId: empKey,
          employeeName: `${employee.first_name} ${employee.last_name}`,
          summary: describeChanges(payload, employee),
          payload,
          baseline,
          requestedBy: displayName,
        })
        setSent(true)
        return
      }

      if (form.location !== employee.location) transferEmployee(empKey, form.location, displayName)
      const saved = updateEmployeeRecord(empKey, updates)
      onSaved(saved)
    } catch (submitError) {
      setError(submitError.message || 'Unable to save employee details.')
    }
  }

  if (sent) {
    return (
      <div className="bg-white rounded-xl border border-emerald-200 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-emerald-800">Sent to Liz for review</h3>
        <p className="mt-1 text-xs text-gray-600">
          The card has not changed yet. Liz sees this in Change requests and the edit is applied only if she approves it.
        </p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-brand-200 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Edit employee card</h3>
        </div>
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-gray-400 hover:text-gray-600">Cancel</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        <Field label="First name" value={form.first_name} onChange={value => update('first_name', value)} required />
        <Field label="Last name" value={form.last_name} onChange={value => update('last_name', value)} required />
        <Field label="Job title" value={form.position} onChange={value => update('position', value)} />
        <label className="block">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Location</span>
          <select
            value={form.location}
            onChange={event => update('location', event.target.value)}
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
        <Field label="T-shirt size" value={form.t_shirt_size} onChange={value => update('t_shirt_size', value)} placeholder="Example: XL" list="edit-t-shirt-sizes" />
        <datalist id="edit-t-shirt-sizes">
          {T_SHIRT_SIZE_SUGGESTIONS.map(size => <option key={size} value={size} />)}
        </datalist>
      </div>

      {error && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
        <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">Save employee card</button>
      </div>
    </form>
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

// A one-line description of what is being asked for, so Liz can decide from
// the list without opening each request.
function describeChanges(payload, employee) {
  const names = {
    first_name: 'first name',
    last_name: 'last name',
    position: 'job title',
    location: 'school',
    birthdate: 'birthdate',
    service_date: 'service date',
    t_shirt_size: 'T-shirt size',
  }
  const parts = Object.keys(payload)
    // display_name and job are written alongside the fields they mirror;
    // listing them would make one change read as three.
    .filter(field => field !== 'display_name' && field !== 'job')
    .map(field => {
      const before = field === 'location' ? employee.location : employee[field]
      const label = names[field] || field
      return `${label}: ${before || '—'} → ${payload[field] || '—'}`
    })
  return parts.join(', ')
}
