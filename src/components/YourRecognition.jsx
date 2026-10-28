// What the person signed in has been given, on the page they land on.
//
// Liz, 2026-10-26: a login can be linked to its employee card, so the
// person signing in is known. Managers hand out recognition all day and
// had nowhere to see their own — it was on their employee card, which they
// had no particular reason to open.
//
// Liz, 2026-10-27: "if an admin member is given recognition, can that show
// up on their dashboard? just like the managers do." It can, and this is
// the same band rather than a second one, because two copies of a star
// count is two numbers that can disagree.
//
// Shown only when the login is linked to somebody. A shared building login
// is not one person and gets nothing, rather than a panel about nobody.

import { Link } from 'react-router-dom'
import {
  RECOGNITION_TYPE_MAP,
  getAceBuckCount,
  getAllRecognitions,
  getDailyStarCount,
  getNextStarLevel,
  getStarLevel,
  isRecognitionInSchoolYear,
  schoolYearStartFor,
} from '../data/recognitionStore.js'

export default function YourRecognition({ employeeId }) {
  if (!employeeId) return null

  const schoolYear = schoolYearStartFor(new Date())
  const records = getAllRecognitions().filter(record =>
    String(record.employeeId) === String(employeeId)
    && isRecognitionInSchoolYear(record, schoolYear))

  const stars = getDailyStarCount(records, employeeId, schoolYear)
  const bucks = getAceBuckCount(records, employeeId, schoolYear)
  const level = getStarLevel(stars)
  const next = getNextStarLevel(stars)
  const recent = records.slice(0, 3)

  return (
    <section className="overflow-hidden rounded-xl border border-[#3d3322] bg-[#15120e] text-white">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[#e8c65c]/50 bg-[#e8c65c]/10 text-xl text-[#ffd75c]" aria-hidden="true">★</span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#e8c65c]">Your recognition</p>
            <p className="mt-0.5 text-xl font-black">
              {stars} earned star{stars === 1 ? '' : 's'}
              {bucks > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 align-middle text-xs font-semibold text-emerald-200">
                  <span aria-hidden="true">◆</span>{bucks} Coach Buck{bucks === 1 ? '' : 's'}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-xs text-amber-100/75">
              {level ? `${level.symbol} ${level.name}` : 'Building toward Bronze Star'}
              {next ? ` · ${next.minimum - stars} more to ${next.name}` : ' · highest level'}
            </p>
          </div>
        </div>
        <Link
          to={`/employee/${encodeURIComponent(employeeId)}`}
          className="rounded-lg border border-[#e8c65c]/40 bg-[#e8c65c]/10 px-3 py-2 text-xs font-bold text-[#f4d87d] hover:bg-[#e8c65c]/20"
        >
          Open my card
        </Link>
      </div>

      {recent.length > 0 && (
        <div className="grid gap-px bg-white/10 sm:grid-cols-3">
          {recent.map(record => (
            <div key={record.id} className="bg-[#15120e] px-5 py-3">
              <p className="text-xs font-bold text-[#f4d87d]">
                {RECOGNITION_TYPE_MAP[record.type]?.label || record.type}
              </p>
              <p className="mt-0.5 text-[11px] text-white/60">
                {record.date}{record.criteria?.[0] ? ` · ${record.criteria[0]}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
