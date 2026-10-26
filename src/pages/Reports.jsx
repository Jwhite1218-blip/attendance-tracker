// The reports hub.
//
// Liz, 2026-10-26, condensing a nav bar that had grown to eleven entries:
// "Dashboard, Attendance, All-Stars, Training, Reports, Settings." Three
// reports used to sit in that bar — two of them, anyway. The daily report
// had a route and no link at all, so the only way to reach it was to know
// the address.
//
// Each card is shown only if this login can actually open it, so the page
// never offers a door that then redirects.

import { Link } from 'react-router-dom'
import { useAuth } from '../components/PinGate.jsx'
import { canViewAttendance } from '../data/futureTools.js'

function ReportCard({ to, title, description }) {
  return (
    <Link
      to={to}
      className="block rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand-300 hover:bg-brand-50 sm:p-5"
    >
      <p className="text-sm font-bold text-gray-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p>
    </Link>
  )
}

export default function Reports() {
  const access = useAuth()
  const seesAttendance = canViewAttendance(access)

  const reports = [
    seesAttendance && {
      to: '/reports/daily',
      title: 'Daily report',
      description: 'A single day across every school — who was out, and under which code. The same summary that is emailed at the end of the day.',
    },
    {
      to: '/reports/custom',
      title: 'Custom report',
      description: 'Pick the schools and the columns you want, then export it as a spreadsheet.',
    },
    seesAttendance && {
      to: '/reports/master',
      title: 'Master report',
      description: 'The whole year of attendance for every employee, school by school.',
    },
  ].filter(Boolean)

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">
          {seesAttendance
            ? 'Attendance and employee reports, ready to print or export.'
            : 'Employee reports, ready to print or export.'}
        </p>
      </header>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {reports.map(report => <ReportCard key={report.to} {...report} />)}
      </div>
    </div>
  )
}
