// What every attendance code means.
//
// One component because it appears on two pages — the Attendance tab and a
// building's own tracker — and a reference that says different things in
// different places is worse than no reference. Liz, 2026-10-26.
import { ATTENDANCE_CODES } from '../data/attendanceCodes.js'

export default function AttendanceCodeReference({ className = '' }) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`} aria-labelledby="code-reference">
      <h2 id="code-reference" className="text-sm font-semibold text-gray-700 mb-3">Attendance Code Reference</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {ATTENDANCE_CODES.map(code => (
          <div key={code.code} className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center rounded text-xs font-bold border px-1.5 py-0.5 min-w-[32px]"
              style={{ backgroundColor: code.hex.bg, color: code.hex.text, borderColor: code.hex.border }}
            >
              {code.shortLabel}
            </span>
            <div>
              <p className="text-xs font-medium text-gray-700">{code.label}</p>
              <p className="text-[10px] text-gray-400">{code.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
