import { Link } from 'react-router-dom'
import { SCHOOLS } from '../data/schools.js'

export default function Dashboard() {
  const totalEmployees = SCHOOLS.reduce((sum, s) => sum + s.rosterSize, 0)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {SCHOOLS.length} schools · {totalEmployees} total employees
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Total Schools</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{SCHOOLS.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Total Employees</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{totalEmployees}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Avg Roster Size</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{Math.round(totalEmployees / SCHOOLS.length)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-500">Largest School</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {SCHOOLS.reduce((max, s) => s.rosterSize > max.rosterSize ? s : max).name.split(' ')[0]}
          </p>
        </div>
      </div>

      {/* School Grid */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Schools</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SCHOOLS.map(school => (
          <Link
            key={school.id}
            to={`/schools/${school.id}`}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
                  {school.name}
                </p>
                <p className="text-sm text-gray-500 mt-1">{school.location}</p>
              </div>
              <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-1 rounded-md">
                {school.code}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center">
                  <span className="text-sm font-semibold text-indigo-600">{school.rosterSize}</span>
                </div>
                <span className="text-sm text-gray-500">employees</span>
              </div>
              <svg className="w-5 h-5 text-gray-400 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
