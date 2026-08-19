import { useEffect, useState } from 'react'
import { ATTENDANCE_CODES, CLEAR_ATTENDANCE } from '../data/attendanceCodes.js'
import { StatusBadgeLarge } from './StatusBadge.jsx'

export default function AttendancePickerModal({ picker, onClose, onSave }) {
  const [selectedCode, setSelectedCode] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    setSelectedCode(picker?.code || '')
    setNote(picker?.note || '')
  }, [picker])

  if (!picker) return null

  const requiresNote = selectedCode === 'O' && !note.trim()

  const handleSave = () => {
    if (requiresNote) return
    onSave(selectedCode, note.trim())
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
        aria-label="Close attendance editor"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-editor-title"
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[88vh] overflow-y-auto"
      >
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-start justify-between gap-3 sticky top-0 bg-white z-10">
          <div>
            <p id="attendance-editor-title" className="text-base font-bold text-gray-900">{picker.empName}</p>
            <p className="text-xs text-gray-500 mt-0.5">{picker.formattedDate || picker.date}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Attendance exception</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ATTENDANCE_CODES.map(code => (
                <button
                  type="button"
                  key={code.code}
                  onClick={() => setSelectedCode(code.code)}
                  className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-all ${
                    selectedCode === code.code
                      ? 'border-brand-400 ring-2 ring-brand-100 bg-brand-50/40'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <StatusBadgeLarge code={code.code} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="attendance-note" className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">
              Comment <span className="normal-case font-normal text-gray-400">{selectedCode === 'O' ? '(required for Other)' : '(optional)'}</span>
            </label>
            <textarea
              id="attendance-note"
              value={note}
              onChange={event => setNote(event.target.value)}
              rows={3}
              placeholder="Example: Significant other had surgery, left at 1:30 PM, documentation received…"
              className={`w-full rounded-xl border px-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-2 ${
                requiresNote ? 'border-red-300 focus:ring-red-100' : 'border-gray-200 focus:border-brand-400 focus:ring-brand-100'
              }`}
            />
            {requiresNote && <p className="text-xs text-red-500 mt-1">Add a short comment when using Other.</p>}
          </div>
        </div>

        <div className="p-4 sm:p-5 border-t border-gray-100 bg-gray-50 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
          <button
            type="button"
            onClick={() => onSave('', '')}
            className="px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            {CLEAR_ATTENDANCE.label}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-white">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!selectedCode || requiresNote}
              className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save attendance
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
