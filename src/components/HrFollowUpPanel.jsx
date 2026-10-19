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
      <details className="mb-3 group">
        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 select-none">
          What do these stages mean?
        </summary>
        <div className="mt-2 space-y-1.5 text-xs text-gray-500 border-l-2 border-gray-200 pl-3">
          <p>
            <span className="font-semibold text-gray-700">Documented occurrences</span> — each no-call/no-show (NCNS), unexcused call-in absence (UNEX), late-in (LI), or early-out (EO) on record for this school year. Approved and protected leave never counts.
          </p>
          <p>
            <span className="font-semibold text-amber-700">Tracked by manager</span> — occurrences 1 to 3. The building manager is keeping an eye on it.
          </p>
          <p>
            <span className="font-semibold text-red-900">Formal attendance tracking needed</span> — from the 4th occurrence. Something is owed <strong>outside this app</strong>, on the district&apos;s own forms.
          </p>
          <p className="pt-1">
            Warren&apos;s ladder, for reference: <strong>4th</strong> verbal warning · <strong>5th</strong> written
            warning · <strong>6th</strong> final written warning · <strong>7th</strong> possible termination.
          </p>
        </div>
      </details>
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
