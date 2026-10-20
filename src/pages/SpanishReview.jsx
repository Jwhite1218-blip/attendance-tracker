// The Spanish wording, laid out to be read and marked up.
//
// Liz, 2026-10-19, asked for the sixty drafted terms "in a form to review".
// Nobody who speaks Spanish has read them yet, which is why every Spanish
// screen still carries the draft notice.
//
// Built from the same dictionary the app uses rather than a copy, so the
// sheet can never show wording the app is not actually displaying — the
// failure that makes a review worthless.
//
// It is meant to be printed and written on. The tick column is for "this is
// right", the ruled column for what it should say instead.

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../components/PinGate.jsx'
import { hasLizAdminAccess } from '../data/futureTools.js'
import { OPEN_QUESTIONS, PROGRAM_STRINGS, REVIEW_GROUPS, approvalRecord } from '../data/programVocabulary.js'

// A reviewer should not have to read a dotted key to know what they are
// looking at. The English text carries the meaning; this says where it
// turns up, in words.
function whereItAppears(key) {
  const parts = String(key).split('.')

  if (parts[0] === 'code') {
    if (parts[1] === 'legacy') return `Older attendance code “${parts[2]}”`
    const kind = parts[2] === 'description' ? 'what it means' : 'name'
    return `Attendance code ${parts[1]} — ${kind}`
  }
  if (parts[0] === 'hr') return 'Attendance follow-up wording'
  if (parts[0] === 'level') return 'Star level name'
  if (parts[0] === 'reason') {
    return parts[2] === 'description'
      ? `Star reason “${parts[1]}” — what it means`
      : `Star reason — name`
  }
  if (parts[0] === 'recognition') {
    const kind = parts[2] === 'description' ? 'what it means' : 'name'
    return `Award — ${kind}`
  }
  return key
}

export default function SpanishReview() {
  const access = useAuth()
  const approval = approvalRecord()
  const rows = useMemo(
    () => REVIEW_GROUPS.map(group => ({
      ...group,
      // A key with no Spanish is a gap worth seeing on the sheet, not one
      // to quietly skip.
      entries: group.keys.map(key => ({
        key,
        english: PROGRAM_STRINGS.en[key] || '',
        spanish: PROGRAM_STRINGS.es[key] || '',
      })),
    })),
    []
  )

  if (!hasLizAdminAccess(access)) {
    return <div className="p-4"><p className="text-sm text-gray-500">Only a district administrator can open the review sheet.</p></div>
  }

  const total = rows.reduce((count, group) => count + group.entries.length, 0)

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 print:p-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          @page { size: letter portrait; margin: 0.5in; }
        }
      `}</style>

      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Print the review sheet
        </button>
        <Link to="/settings" className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50">
          Back to Settings
        </Link>
      </div>

      <header className="border-b-2 border-black pb-3">
        <h1 className="text-xl font-bold text-gray-900">Spanish wording — for review</h1>
        <p className="mt-1 text-sm text-gray-600">
          Warren Township food service attendance tracker. {total} terms, drafted but not yet read by a Spanish
          speaker.
        </p>
        <p className="mt-2 text-sm text-gray-700">
          Please read the Spanish beside each English phrase. Tick it if it is right. If it is not, write what it
          should say. Where a word is wrong only because of how it is used here, say so in the margin — the
          English column says where each phrase appears.
        </p>
        {approval
          ? <p className="mt-2 text-sm font-semibold text-emerald-800">Already signed off by {approval.approvedBy} on {approval.approvedOn}.</p>
          : <p className="mt-2 text-sm font-semibold text-amber-800">
              Not yet signed off. Until it is, every Spanish screen tells people the wording is still a draft.
            </p>}
        {/* The rules stretch to whatever room there is rather than being a
            fixed width that wraps onto its own line on a narrow screen. */}
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
          <p className="flex min-w-[14rem] flex-1 items-end gap-2">
            <span className="flex-none">Reviewed by</span>
            <span className="h-4 flex-1 border-b border-black" />
          </p>
          <p className="flex min-w-[10rem] items-end gap-2">
            <span className="flex-none">Date</span>
            <span className="h-4 w-32 border-b border-black" />
          </p>
        </div>
      </header>

      {rows.map(group => (
        <section key={group.title} className="mt-6">
          <h2 className="text-base font-bold text-gray-900">{group.title}</h2>
          {group.note && <p className="mt-0.5 text-xs italic text-gray-600">{group.note}</p>}
          {/* On a narrow screen the table scrolls rather than the page.
              In print it is on a letter sheet and needs neither. */}
          <div className="overflow-x-auto print:overflow-visible">
          <table className="mt-2 w-full min-w-[32rem] border-collapse text-sm print:min-w-0">
            <thead>
              <tr className="border-b-2 border-gray-400 text-left align-bottom">
                <th className="w-[34%] py-1.5 pr-2 text-xs font-bold uppercase tracking-wide text-gray-500">English</th>
                <th className="w-[30%] py-1.5 pr-2 text-xs font-bold uppercase tracking-wide text-gray-500">Spanish as drafted</th>
                <th className="w-[6%] py-1.5 pr-2 text-center text-xs font-bold uppercase tracking-wide text-gray-500">OK</th>
                <th className="py-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">Should say instead</th>
              </tr>
            </thead>
            <tbody>
              {group.entries.map(entry => (
                <tr key={entry.key} className="border-b border-gray-300 align-top">
                  <td className="py-2 pr-2">
                    <span className="block text-gray-900">{entry.english}</span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">{whereItAppears(entry.key)}</span>
                  </td>
                  <td className="py-2 pr-2 text-gray-900">
                    {entry.spanish || <span className="font-semibold text-red-700">Nothing drafted</span>}
                  </td>
                  <td className="py-2 pr-2 text-center">
                    <span className="inline-block h-4 w-4 border border-black align-middle" />
                  </td>
                  <td className="py-2">
                    <span className="block h-4 border-b border-gray-400" />
                    <span className="mt-2 block h-4 border-b border-gray-400" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      ))}

      <section className="mt-8 break-inside-avoid">
        <h2 className="text-base font-bold text-gray-900">Questions for the reviewer</h2>
        <p className="mt-0.5 text-xs italic text-gray-600">
          Judgement calls made while drafting. A yes or no on each is as useful as a correction.
        </p>
        <ol className="mt-2 space-y-3 text-sm">
          {OPEN_QUESTIONS.map((question, index) => (
            <li key={index} className="border-b border-gray-300 pb-3">
              <span className="font-semibold">{index + 1}.</span> {question}
              <span className="mt-2 block h-4 border-b border-gray-400" />
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-8 border-t border-gray-300 pt-3 text-xs text-gray-600">
        <p>
          When this comes back, the corrections have to be typed into the app before the sign-off means anything.
          Signing off without applying them would clear the draft notice from wording nobody fixed.
        </p>
        <p className="mt-1">The sign-off itself is recorded in Settings, under Spanish sign-off.</p>
      </footer>
    </div>
  )
}
