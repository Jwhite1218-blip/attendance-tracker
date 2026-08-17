import { Routes, Route, Link, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import LocationView from './pages/LocationView.jsx'
import MasterReport from './pages/MasterReport.jsx'
import LedgerView from './pages/LedgerView.jsx'
import QuickMark from './pages/QuickMark.jsx'
import PinGate, { logout } from './components/PinGate.jsx'
import warrenLogo from './assets/warren-logo.png'
import aramarkLogo from './assets/aramark-logo.png'

export default function App() {
  const location = useLocation()

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/quickmark', label: 'Quick Mark' },
    { path: '/ledger', label: 'Ledger View' },
    { path: '/reports/master', label: 'Master Report' },
  ]

  const Inner = (
    <div className="min-h-screen bg-charcoal-800">
      <nav className="bg-charcoal-900 border-b border-charcoal-600 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-charcoal-800 rounded-md flex items-center justify-center overflow-hidden border border-brand-600/40">
                <img src={warrenLogo} alt="Warren Township" className="w-8 h-8 object-contain" />
              </div>
              <div>
                <span className="text-base font-bold text-brand-200 block leading-none tracking-wide">WARREN TOWNSHIP</span>
                <span className="text-[10px] text-charcoal-200">Food Service Attendance · {new Date().getFullYear()}</span>
              </div>
            </Link>

            <div className="flex items-center gap-1 flex-wrap">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    location.pathname === item.path
                      ? 'bg-brand-500/15 text-brand-200'
                      : 'text-charcoal-200 hover:bg-charcoal-600 hover:text-brand-100'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="flex items-center gap-3 pl-4 border-l border-charcoal-600 ml-2">
              <img src={aramarkLogo} alt="Aramark Student Nutrition" className="hidden sm:block h-8 object-contain" />
              <button
                onClick={logout}
                className="text-charcoal-300 hover:text-red-400 transition-colors p-1.5"
                title="Lock & Log Out"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/location/:id" element={<LocationView />} />
        <Route path="/quickmark" element={<QuickMark />} />
        <Route path="/ledger" element={<LedgerView />} />
        <Route path="/reports/master" element={<MasterReport />} />
      </Routes>
    </div>
  )

  return <PinGate>{Inner}</PinGate>
}
