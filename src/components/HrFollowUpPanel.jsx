import { CODE_MAP } from '../data/attendanceCodes.js'
import { useProgramTerms } from './useProgramTerms.js'
import { ATTENDANCE_SEVERITY_CLASS, attendanceSeverityOf, getAttendanceStageLabel } from '../data/hrFlags.js'
import { LOCATION_MAP } from '../data/locations.js'

// flaggedEmployees: [{ ...hrFlags status, employee }]. Shared by the district
// Dashboard (every school) and each building's LocationView (that school's
// roster only) so the follow-up list looks and behaves the same everywhere.
export default function HrFollowUpPanel({ flaggedEmployees, onEmployeeSelect, showLocation = true }) {
  const term = useProgramTerms()
  if (!flaggedEmployees.length) return null

  return (
    <div id="hr-follow-up" className="scroll-mt-24 bg-white rounded-xl border border-red-200 p-5 mb-8">
      <h2 className="text-sm font-semibold text-red-700 mb-1">HR Attendance Follow-Up</h2>
      <p className="mb-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-gray-600">
        <strong className="text-gray-800">A count, not a record.</strong> This list shows how many occurrences
        somebody has. It is not documentation of any warning or disciplinary step, and it does not replace the
        district&apos;s HR forms or process.
      </p>
      <p className="text-xs text-gray-400 mb-1">
        Active employees only. Occurrences are counted per school year (July–June).
      </p>
      <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
          HR reference · handled outside this app
        </p>
        <ul className="mt-1.5 grid gap-x-5 gap-y-0.5 text-xs text-gray-600 sm:grid-cols-2">
          <li><strong className="text-gray-800">4th</strong> verbal warning</li>
          <li><strong className="text-gray-800">5th</strong> written warning</li>
          <li><strong className="text-gray-800">6th</strong> final written warning</li>
          <li><strong className="text-gray-800">7th</strong> possible termination</li>
        </ul>
        <p className="mt-1.5 text-[11px] text-gray-500">
          An occurrence is a no-call/no-show, unexcused call-in, late-in or early-out. Approved and
          protected leave never counts.
        </p>
      </div>
      <div className="divide-y divide-gray-100">
        {flaggedEmployees.map(f => (
          <button
            type="button"
            key={`${f.empId}-${f.schoolYearStart}`}
            onClick={() => onEmployeeSelect(f.employee)}
            className="w-full py-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 text-left hover:bg-red-50/40 transition-colors -mx-1 px-1 rounded"
          >
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${ATTENDANCE_SEVERITY_CLASS[attendanceSeverityOf(f)]}`}>{f.employee.first_name} {f.employee.last_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {showLocation && `${LOCATION_MAP[f.employee.location]?.name || f.employee.location} · `}{f.employee.position}
              </p>
              <p className={`text-xs font-semibold mt-1.5 ${ATTENDANCE_SEVERITY_CLASS[attendanceSeverityOf(f)]}`}>
                {term.stageLabel(f)} · {f.occurrenceCount} occurrence{f.occurrenceCount === 1 ? '' : 's'} · {f.schoolYearStart}–{f.schoolYearStart + 1}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {f.triggers.map((t, i) => (
                  <span key={i} className="text-[10px] font-medium bg-red-50 text-red-600 border border-red-200 rounded px-1.5 py-0.5">
                    {t.date} · {CODE_MAP[t.code]?.shortLabel}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-400 whitespace-nowrap sm:text-right">
              Updated {new Date(f.updatedAt).toLocaleDateString()}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
