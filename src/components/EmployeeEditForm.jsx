import { useState } from 'react'
import { LOCATIONS } from '../data/locations.js'
import { transferEmployee, updateEmployeeRecord } from '../data/employeeLocations.js'

function normalizeBirthday(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})$/)
  if (!match) throw new Error('Birthday must use MM-DD, without the birth year.')
  const month = Number(match[1])
  const day = Number(match[2])
  const date = new Date(2000, month - 1, day)
  if (date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('Enter a valid birthday.')
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function EmployeeEditForm({ employee, onCancel, onSaved }) {
  const [form, setForm] = useState({
    first_name: employee.first_name || '',
    last_name: employee.last_name || '',
    position: employee.position || '',
    location: employee.location || '',
    birthdate: employee.birthdate || '',
    hire_date: employee.hire_date || '',
    service_date: employee.service_date || '',
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
      if (form.location !== employee.location) transferEmployee(empKey, form.location)
      const saved = updateEmployeeRecord(empKey, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        display_name: `${form.first_name.trim()} ${form.last_name.trim()}`,
        position: form.position.trim(),
        job: form.position.trim(),
        birthdate: normalizeBirthday(form.birthdate),
        hire_date: form.hire_date,
        service_date: form.service_date,
      })
      onSaved(saved)
    } catch (submitError) {
      setError(submitError.message || 'Unable to save employee details.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-brand-200 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Edit employee card</h3>
          <p className="text-xs text-gray-400 mt-1">Personnel ID {employee.kronos_id} is locked so attendance history stays connected.</p>
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
        <Field label="Hire date" type="date" value={form.hire_date} onChange={value => update('hire_date', value)} />
        <Field label="Service date" type="date" value={form.service_date} onChange={value => update('service_date', value)} />
      </div>

      {error && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
        <button type="submit" className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">Save employee card</button>
      </div>
    </form>
  )
}

function Field({ label, value, onChange, type = 'text', required = false, placeholder = '' }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <input
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        required={required}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  )
}
