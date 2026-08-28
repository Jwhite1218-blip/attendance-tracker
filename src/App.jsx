import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import CalendarView from './pages/CalendarView.jsx'
import LocationView from './pages/LocationView.jsx'
import CustomReport from './pages/CustomReport.jsx'
import MasterReport from './pages/MasterReport.jsx'
import LedgerView from './pages/LedgerView.jsx'
import EmployeeRecordPage from './pages/EmployeeRecordPage.jsx'
import BackupRecovery from './pages/BackupRecovery.jsx'
import PinGate, { logout, useAuth } from './components/PinGate.jsx'
import { canViewBlackoutCalendar, hasLizAdminAccess } from './data/futureTools.js'
import { LOCATION_MAP } from './data/locations.js'
import warrenLogo from './assets/warren-logo.png'
import localisLogo from './assets/localis-logo.png'

export default function App() {
  return (
    <PinGate>
      <AppShell />
    </PinGate>
  )
}

function AppShell() {
  const location = useLocation()
  const { role, locationId, displayName, canEditAttendance, canManageRoster, canManageBlackouts, watermark, syncStatus } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const accessLabel = !canEditAttendance
    ? 'Read-only review'
    : role === 'school'
      ? 'School Manager'
      : canManageRoster && canManageBlackouts
        ? 'Administrator'
        : 'Administrator · Limited editing'

  const homePath = role === 'school' ? `/location/${locationId}` : '/'
  const showBlackoutCalendar = canViewBlackoutCalendar({ role, canEditAttendance, canManageBlackouts })
  const lizAdminAccess = hasLizAdminAccess({ role, canManageRoster, canManageBlackouts })
  const navItems = [
    ...(role === 'admin' ? [{ path: '/', label: 'Dashboard' }] : []),
    { path: '/ledger', label: 'Employee Records' },
    ...(showBlackoutCalendar ? [{ path: '/calendar', label: 'Blackout Calendar' }] : []),
    ...(role === 'admin' ? [{ path: '/reports/custom', label: 'Custom Report' }] : []),
    ...(role === 'admin' ? [{ path: '/reports/master', label: 'Master Report' }] : []),
  ]

  const schoolName = role === 'school' ? LOCATION_MAP[locationId]?.name : null
  const navItemIsActive = item => (
    location.pathname === item.path
    || (item.path === '/ledger' && location.pathname.startsWith('/employee/'))
  )

  // Close mobile menu on route change
  const handleNavClick = () => setMobileMenuOpen(false)

  return (
    <div className="min-h-screen bg-charcoal-800">
      {watermark === 'localis' && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden" aria-hidden="true">
          <img src={localisLogo} alt="" className="w-[min(76vw,760px)] max-h-[78vh] object-contain opacity-[0.08]" />
        </div>
      )}
      <nav className="bg-charcoal-900 border-b border-charcoal-600 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo - always visible */}
            <Link to={homePath} className="flex items-center gap-2 sm:gap-3 flex-shrink-0" onClick={handleNavClick}>
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-charcoal-800 rounded-md flex items-center justify-center overflow-hidden border border-brand-600/40 flex-shrink-0">
                <img src={warrenLogo} alt="Warren Township" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" />
              </div>
              <div className="hidden xs:block sm:block">
                <span className="text-sm sm:text-base font-bold text-brand-200 block leading-none tracking-wide">WARREN TOWNSHIP</span>
                <span className="text-[9px] sm:text-[10px] text-charcoal-200">
                  {schoolName ? schoolName : 'Food Service Attendance'} · {new Date().getFullYear()}
                </span>
              </div>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    navItemIsActive(item)
                      ? 'bg-brand-500/15 text-brand-200'
                      : 'text-charcoal-200 hover:bg-charcoal-600 hover:text-brand-100'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Right side - Localis product mark + logout (desktop) */}
            <div className="hidden md:flex items-center gap-3 pl-4 border-l border-charcoal-600 ml-2">
              <span
                className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${
                  syncStatus === 'pending' ? 'text-red-300' : syncStatus === 'saving' ? 'text-amber-200' : 'text-emerald-300'
                }`}
                title={syncStatus === 'pending' ? 'Changes are saved on this device and will retry automatically.' : 'Shared attendance data is connected.'}
              >
                <span className={`w-2 h-2 rounded-full ${
                  syncStatus === 'pending' ? 'bg-red-400' : syncStatus === 'saving' ? 'bg-amber-300' : 'bg-emerald-400'
                }`} />
                {syncStatus === 'pending' ? 'Retrying' : syncStatus === 'saving' ? 'Saving' : 'Shared'}
              </span>
              {displayName && (
                <div className="hidden xl:block text-right leading-tight">
                  <span className="block text-xs font-semibold text-brand-100">{displayName}</span>
                  <span className="block text-[10px] text-charcoal-300">{accessLabel}</span>
                </div>
              )}
              <img src={localisLogo} alt="Localis" className="h-9 w-auto object-contain" />
              <button
                onClick={logout}
                className="text-charcoal-300 hover:text-red-400 transition-colors p-1.5"
                title="Lock & Log Out"
                aria-label="Lock and log out"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="flex md:hidden items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  syncStatus === 'pending' ? 'bg-red-400' : syncStatus === 'saving' ? 'bg-amber-300' : 'bg-emerald-400'
                }`}
                title={syncStatus === 'pending' ? 'Shared-data sync will retry automatically.' : 'Shared attendance data is connected.'}
              />
              {displayName && (
                <span
                  className="max-w-20 truncate text-[10px] font-semibold text-brand-100"
                  title={`${displayName} · ${accessLabel}`}
                >
                  {displayName}
                </span>
              )}
              <button
                onClick={logout}
                className="text-charcoal-300 hover:text-red-400 transition-colors p-1.5"
                title="Lock & Log Out"
                aria-label="Lock and log out"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-charcoal-200 hover:text-white p-2 -mr-2"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Mobile dropdown menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-charcoal-600 pb-3 pt-2 space-y-1">
              {navItems.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={handleNavClick}
                  className={`block px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    navItemIsActive(item)
                      ? 'bg-brand-500/15 text-brand-200'
                      : 'text-charcoal-200 hover:bg-charcoal-600'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="flex items-center gap-2 px-3 pt-3 mt-2 border-t border-charcoal-600">
                <img src={localisLogo} alt="Localis" className="h-8 w-auto object-contain" />
                <span className="text-xs text-charcoal-300">Localis Collective</span>
              </div>
            </div>
          )}
        </div>
      </nav>

      {!canEditAttendance && (
        <div className="sticky top-16 z-40 border-b border-cyan-200 bg-cyan-50/95 px-4 py-2 text-center text-xs font-semibold text-cyan-900 backdrop-blur">
          Read-only access · Navigation is enabled · All changes are disabled
        </div>
      )}

      <main id="main-content">
        <Routes>
          <Route path="/" element={role === 'school' ? <Navigate to={homePath} replace /> : <Dashboard />} />
          <Route path="/location/:id" element={<LocationView />} />
          <Route path="/employee/:employeeId" element={<EmployeeRecordPage />} />
          <Route path="/quickmark" element={<Navigate to={homePath} replace />} />
          <Route path="/calendar" element={showBlackoutCalendar ? <CalendarView /> : <Navigate to={homePath} replace />} />
          <Route path="/ledger" element={<LedgerView />} />
          <Route path="/reports/custom" element={role === 'school' ? <Navigate to={homePath} replace /> : <CustomReport />} />
          <Route path="/reports/master" element={role === 'school' ? <Navigate to={homePath} replace /> : <MasterReport />} />
          <Route path="/backup-recovery" element={lizAdminAccess ? <BackupRecovery /> : <Navigate to={homePath} replace />} />
        </Routes>
      </main>
    </div>
  )
}
