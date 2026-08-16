import { Routes, Route, Link, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import LocationView from './pages/LocationView.jsx'
import MasterReport from './pages/MasterReport.jsx'

export default function App() {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/reports/master', label: 'Master Report' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <span className="text-lg font-bold text-gray-900 block leading-none">Attendance Tracker</span>
                <span className="text-[10px] text-gray-400">Food Service Staff · {new Date().getFullYear()}</span>
              </div>
            </Link>
            <div className="flex items-center gap-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* Routes */}
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/location/:id" element={<LocationView />} />
        <Route path="/reports/master" element={<MasterReport />} />
      </Routes>
    </div>
  )
}
