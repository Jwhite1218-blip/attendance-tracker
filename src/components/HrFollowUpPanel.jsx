import { CODE_MAP } from '../data/attendanceCodes.js'
import { getAttendanceStageLabel } from '../data/hrFlags.js'
import { LOCATION_MAP } from '../data/locations.js'

// flaggedEmployees: [{ ...hrFlags status, employee }]. Shared by the district
// Dashboard (every school) and each building's LocationView (that school's
// roster only) so the follow-up list looks and behaves the same everywhere.
export default function HrFollowUpPanel({ flaggedEmployees, onEmployeeSelect, showLocation = true }) {
  if (!flaggedEmployees.length) return null

  return (
    <div className="bg-white rounded-xl border border-red-200 p-5 mb-8">
      <h2 className="text-sm font-semibold text-red-700 mb-1">HR Attendance Follow-Up</h2>
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
            <span className="font-semibold text-amber-700">Formal attendance tracking</span> — reached at the 3rd occurrence. The employee is now formally being tracked for attendance.
          </p>
          <p>
            <span className="font-semibold text-amber-700">Verbal warning required</span> — reached at the 4th occurrence. A verbal warning needs to be given and documented.
          </p>
          <p>
            <span className="font-semibold text-red-700">Union seniority reset</span> — triggered by two no-call/no-shows (NCNS) on back-to-back scheduled workdays. An unexcused call-in (UNEX) does not trigger this: it still counts as an occurrence, but the employee did call. Under the union agreement a reset changes the employee&apos;s seniority standing, so it is flagged separately and listed first. Weekends and district holidays do not break the streak — two NCNS days on either side of them still count as back-to-back.
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
              <p className="text-sm font-semibold text-red-600">{f.employee.first_name} {f.employee.last_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {showLocation && `${LOCATION_MAP[f.employee.location]?.name || f.employee.location} · `}{f.employee.position}
              </p>
              <p className={`text-xs font-semibold mt-1.5 ${f.seniorityReset ? 'text-red-700' : 'text-amber-700'}`}>
                {getAttendanceStageLabel(f)} · {f.occurrenceCount} occurrence{f.occurrenceCount === 1 ? '' : 's'} · {f.schoolYearStart}–{f.schoolYearStart + 1}
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
