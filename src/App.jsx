import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import ManagerHome from './pages/ManagerHome.jsx'
import Training from './pages/Training.jsx'
import ProgramSettings from './pages/ProgramSettings.jsx'
import ChangeRequests from './pages/ChangeRequests.jsx'
import Reports from './pages/Reports.jsx'
import SpanishReview from './pages/SpanishReview.jsx'
import { pendingRequests } from './data/approvalRequests.js'
import { getApprovalRequests } from './data/approvalStore.js'
import AccessAdmin from './pages/AccessAdmin.jsx'
import DailyReport from './pages/DailyReport.jsx'
import CalendarView from './pages/CalendarView.jsx'
import LocationView from './pages/LocationView.jsx'
import CustomReport from './pages/CustomReport.jsx'
import RecognitionReport from './pages/RecognitionReport.jsx'
import MasterReport from './pages/MasterReport.jsx'
import LedgerView from './pages/LedgerView.jsx'
import StaffAdmin from './pages/StaffAdmin.jsx'
import EmployeeRecordPage from './pages/EmployeeRecordPage.jsx'
import RecognitionProgram from './pages/RecognitionProgram.jsx'
import BackupRecovery from './pages/BackupRecovery.jsx'
import PublicSchoolLeaderboard from './pages/PublicSchoolLeaderboard.jsx'
import FoodDayCelebration, { FoodDayBanner } from './components/FoodDayCelebration.jsx'
import { FOOD_DAY_PATH } from './data/foodDay.js'
import PinGate, { logout, useAuth } from './components/PinGate.jsx'
import { LanguageToggle, useLanguage } from './components/LanguageProvider.jsx'
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx'
import ReleaseBadge from './components/ReleaseBadge.jsx'
import { useProgramTerms } from './components/useProgramTerms.js'
import { canAccessRecognitionProgram, canViewAttendance as canSeeAttendance, canViewBlackoutCalendar, canViewReports as canSeeReports, canViewTraining as canSeeTraining, hasLizAdminAccess } from './data/futureTools.js'
import { LOCATION_MAP } from './data/locations.js'
import warrenLogo from './assets/warren-logo.png'
import localisLogo from './assets/localis-logo.png'

const TEST_ENVIRONMENT_LABEL = String(import.meta.env.VITE_TEST_ENVIRONMENT_LABEL || '').trim()

export default function App() {
  const location = useLocation()
  if (location.pathname.startsWith('/school-stars/')) {
    return (
      <>
      <ReleaseBadge />
      <Routes>
        <Route path="/school-stars/:token" element={<PublicSchoolLeaderboard />} />
      </Routes>
      </>
    )
  }
  return (
    <>
    <ReleaseBadge />
    <PinGate>
      <AppShell />
    </PinGate>
    </>
  )
}

// Exported for the render harness. The shell holds the nav, the route
// table and the capability logic that decides both — and it was the one
// part of the application the harness never rendered, which is how a
// reference to a const declared later in the same function reached the
// point of being deployed on 2026-10-26.
export function AppShell() {
  const location = useLocation()
  const access = useAuth()
  const {
    role,
    locationId,
    locationIds,
    onLocationChange,
    displayName,
    canEditAttendance,
    canEditRecognition,
    recognitionOnly,
    canManageRoster,
    canManageBlackouts,
    watermark,
    syncStatus,
  } = access
  const { t } = useLanguage()
  const term = useProgramTerms()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const schoolRecognitionOnly = role === 'school' && canEditRecognition && !canEditAttendance

  const accessLabel = recognitionOnly
    ? t('role.recognitionPilot')
    : schoolRecognitionOnly
      ? t('role.schoolRecognition')
    : !canEditAttendance
    ? t('role.readOnly')
    : role === 'school'
      ? t('role.schoolManager')
      : canManageRoster && canManageBlackouts
        ? t('role.administrator')
        : t('role.administratorLimited')

  // Liz, 2026-10-26: a login can be given the whole district's recognition
  // and none of its attendance. The server already withholds the records;
  // these keep the pages and the nav from offering what is not there.
  //
  // Declared before homePath, which reads attendanceHidden. The first
  // version of this sat below it and threw a ReferenceError on every render
  // for every user — see the AppShell entry in scripts/render-pages.jsx,
  // which exists because of it.
  const seesAttendance = canSeeAttendance(access)
  const seesTraining = canSeeTraining(access)
  const seesReports = canSeeReports(access)
  // With attendance hidden the Dashboard is a shell — it is the HR follow-up
  // list, the week's exceptions and upcoming time off. Send them where the
  // work actually is.
  const attendanceHidden = role === 'admin' && !seesAttendance

  const homePath = recognitionOnly || attendanceHidden ? '/recognition' : '/'
  // The whole access object, so the resolved canViewBlackouts is honoured
  // rather than the pre-2026-10-26 fallback being recomputed from two flags.
  const showBlackoutCalendar = canViewBlackoutCalendar(access)
  const lizAdminAccess = hasLizAdminAccess({ role, canManageRoster, canManageBlackouts })
  // Shown beside the nav label, so something waiting on Liz is visible from
  // any page rather than only if she thinks to look.
  const pendingCount = useMemo(
    () => (lizAdminAccess ? pendingRequests(getApprovalRequests()).length : 0),
    [lizAdminAccess, location.pathname]
  )
  const recognitionAdminAccess = canAccessRecognitionProgram({ role })
  // Six entries, no more. Liz, 2026-10-26: the bar had grown to eleven and
  // the later ones — Change requests among them — were running off the end
  // of a 1280px screen with nothing to wrap or scroll them.
  //
  // Everything she alone can reach moved behind Settings, which carries the
  // waiting-request count so burying the queue does not hide it. The three
  // reports moved behind a Reports hub, which also gave the daily report a
  // link for the first time — it had a route and no way to reach it.
  const standardNavItems = [
    // Every signed-in role gets the Dashboard entry, pointing at its own
    // homePath — a school manager still only ever reaches their own location's
    // dashboard. Hiding it (d7997ee) removed a duplicate nav path but read to
    // managers as the button disappearing, so Liz asked for it back (2026-09-01).
    { path: homePath, label: t('nav.dashboard') },
    // A building's attendance is its own tracker; the district's is the
    // employee card ledger. One entry, pointing at whichever this login
    // actually has.
    ...(role === 'school'
      ? [{ path: `/location/${locationId}`, label: t('nav.attendance') }]
      : seesAttendance ? [{ path: '/ledger', label: t('nav.attendance') }] : []),
    ...(recognitionAdminAccess ? [{ path: '/recognition', label: t('nav.allStars') }] : []),
    ...(seesTraining ? [{ path: '/training', label: t('nav.training') }] : []),
    ...(seesReports ? [{ path: '/reports', label: t('nav.reports') }] : []),
    ...(lizAdminAccess
      ? [{ path: '/settings', label: pendingCount ? `${t('nav.settings')} (${pendingCount})` : t('nav.settings') }]
      : []),
  ]
  const navItems = recognitionOnly
    ? [{ path: '/recognition', label: t('nav.allStars') }]
    : standardNavItems

  const schoolName = role === 'school' ? LOCATION_MAP[locationId]?.name : null
  const navItemIsActive = item => (
    location.pathname === item.path
    || (item.path === '/ledger' && location.pathname.startsWith('/employee/'))
  )

  // Close mobile menu on route change
  const handleNavClick = () => setMobileMenuOpen(false)

  return (
    <div className="min-h-screen bg-charcoal-800 print:bg-white">
      {watermark === 'localis' && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center overflow-hidden" aria-hidden="true">
          <img src={localisLogo} alt="" className="w-[min(76vw,760px)] max-h-[78vh] object-contain opacity-[0.08]" />
        </div>
      )}
      <nav className="print:hidden bg-charcoal-900 border-b border-charcoal-600 sticky top-0 z-50">
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

            {/* Liz, 2026-10-26: a manager covering several kitchens picks
                which one they are working in. Everything else on the page
                already reads the chosen building, so this is the whole
                control. Absent for the fifteen logins that cover one. */}
            {/* Visible at every width. The first version was hidden below
                1024px, which is most of the tablets this is used on, so the
                managers it exists for could not see it. */}
            {onLocationChange && (
              <label className="flex items-center gap-2">
                <span className="sr-only">Which school are you working in?</span>
                <select
                  value={locationId || ''}
                  onChange={event => onLocationChange(event.target.value)}
                  className="rounded-lg border border-charcoal-600 bg-charcoal-800 px-2 py-1.5 text-xs font-semibold text-brand-100"
                >
                  {(locationIds || []).map(id => (
                    <option key={id} value={id}>{LOCATION_MAP[id]?.name || id}</option>
                  ))}
                </select>
              </label>
            )}

            {/* Desktop nav */}
            <div className="hidden xl:flex items-center gap-1">
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
            <div className="hidden xl:flex items-center gap-3 pl-4 border-l border-charcoal-600 ml-2">
              <span
                className={`inline-flex items-center gap-1.5 text-[10px] font-semibold ${
                  syncStatus === 'pending' ? 'text-red-300' : syncStatus === 'saving' ? 'text-amber-200' : 'text-emerald-300'
                }`}
                title={syncStatus === 'pending' ? t('sync.retryingTitle') : t('sync.connectedTitle')}
              >
                <span className={`w-2 h-2 rounded-full ${
                  syncStatus === 'pending' ? 'bg-red-400' : syncStatus === 'saving' ? 'bg-amber-300' : 'bg-emerald-400'
                }`} />
                {syncStatus === 'pending' ? t('sync.retrying') : syncStatus === 'saving' ? t('sync.saving') : t('sync.shared')}
              </span>
              {displayName && (
                <div className="hidden xl:block text-right leading-tight">
                  <span className="block text-xs font-semibold text-brand-100">{displayName}</span>
                  <span className="block text-[10px] text-charcoal-300">{accessLabel}</span>
                </div>
              )}
              <LanguageToggle />
              <img src={localisLogo} alt="Localis" className="h-9 w-auto object-contain" />
              <button
                onClick={logout}
                className="text-charcoal-300 hover:text-red-400 transition-colors p-1.5"
                title={t('nav.logout')}
                aria-label={t('nav.logout')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="flex xl:hidden items-center gap-2">
              <LanguageToggle />
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  syncStatus === 'pending' ? 'bg-red-400' : syncStatus === 'saving' ? 'bg-amber-300' : 'bg-emerald-400'
                }`}
                title={syncStatus === 'pending' ? t('sync.retryingTitle') : t('sync.connectedTitle')}
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
                title={t('nav.logout')}
                aria-label={t('nav.logout')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="text-charcoal-200 hover:text-white p-2 -mr-2"
                aria-label={t('nav.toggleMenu')}
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
            <div className="xl:hidden border-t border-charcoal-600 pb-3 pt-2 space-y-1">
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

      {term.isDraftLanguage && (
        <div className="print:hidden border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-900">
          {t('language.draftNotice')}
        </div>
      )}

      {TEST_ENVIRONMENT_LABEL && (
        <div className="print:hidden border-b border-fuchsia-300 bg-fuchsia-700 px-4 py-2 text-center text-xs font-black uppercase tracking-[0.16em] text-white shadow-sm">
          {TEST_ENVIRONMENT_LABEL} · Isolated test data · Nothing entered here affects production
        </div>
      )}

      {recognitionOnly ? (
        <div className="print:hidden sticky top-16 z-40 border-b border-fuchsia-200 bg-fuchsia-50/95 px-4 py-2 text-center text-xs font-semibold text-fuchsia-950 backdrop-blur">
          Recognition pilot · Entries save only to the isolated clone · Attendance and HR tools are unavailable
        </div>
      ) : schoolRecognitionOnly ? (
        <div className="print:hidden sticky top-16 z-40 border-b border-amber-200 bg-amber-50/95 px-4 py-2 text-center text-xs font-semibold text-amber-950 backdrop-blur">
          Recognition access · All-Star entries are enabled for this school · Attendance changes are disabled
        </div>
      ) : !canEditAttendance && (
        <div className="print:hidden sticky top-16 z-40 border-b border-cyan-200 bg-cyan-50/95 px-4 py-2 text-center text-xs font-semibold text-cyan-900 backdrop-blur">
          {t('banner.readOnly')}
        </div>
      )}

      <main id="main-content">
        <FoodDayBanner pathname={location.pathname} homePath={homePath} />
        <RouteErrorBoundary routeKey={location.pathname}>
        <Routes>
          <Route path={FOOD_DAY_PATH} element={<FoodDayCelebration homePath={homePath} canRecognize={recognitionAdminAccess} />} />
          <Route path="/" element={recognitionOnly || attendanceHidden ? <Navigate to={homePath} replace /> : role === 'school' ? <ManagerHome /> : <Dashboard />} />
          <Route path="/location/:id" element={recognitionOnly || !seesAttendance ? <Navigate to={homePath} replace /> : <LocationView />} />
          <Route path="/recognition" element={recognitionAdminAccess ? <RecognitionProgram /> : <Navigate to={homePath} replace />} />
          <Route path="/employee/:employeeId" element={recognitionOnly ? <Navigate to={homePath} replace /> : <EmployeeRecordPage />} />
          <Route path="/quickmark" element={<Navigate to={homePath} replace />} />
          <Route path="/calendar" element={showBlackoutCalendar ? <CalendarView /> : <Navigate to={homePath} replace />} />
          <Route path="/ledger" element={recognitionOnly || !seesAttendance ? <Navigate to={homePath} replace /> : <LedgerView />} />
          {/* Reached from the Dashboard button rather than the nav: roster
              housekeeping is occasional and does not belong on the front page. */}
          <Route path="/staff" element={role === 'admin' ? <StaffAdmin /> : <Navigate to={homePath} replace />} />
          <Route path="/training" element={!seesTraining ? <Navigate to={homePath} replace /> : <Training />} />
          <Route path="/settings" element={lizAdminAccess ? <ProgramSettings /> : <Navigate to={homePath} replace />} />
          <Route path="/requests" element={lizAdminAccess ? <ChangeRequests /> : <Navigate to={homePath} replace />} />
          {/* Reached from the Spanish section of Settings, not the nav: it
              is a sheet you print once, not a page you visit. */}
          <Route path="/settings/spanish-review" element={lizAdminAccess ? <SpanishReview /> : <Navigate to={homePath} replace />} />
          <Route path="/access" element={lizAdminAccess ? <AccessAdmin /> : <Navigate to={homePath} replace />} />
          <Route path="/reports" element={seesReports ? <Reports /> : <Navigate to={homePath} replace />} />
          <Route path="/reports/daily" element={!seesReports || !seesAttendance ? <Navigate to={homePath} replace /> : <DailyReport />} />
          <Route path="/reports/custom" element={seesReports ? <CustomReport /> : <Navigate to={homePath} replace />} />
          <Route path="/reports/master" element={!seesReports || !seesAttendance ? <Navigate to={homePath} replace /> : <MasterReport />} />
          <Route path="/reports/recognition" element={!seesReports || !recognitionAdminAccess ? <Navigate to={homePath} replace /> : <RecognitionReport />} />
          <Route path="/backup-recovery" element={lizAdminAccess ? <BackupRecovery /> : <Navigate to={homePath} replace />} />
        </Routes>
        </RouteErrorBoundary>
      </main>
    </div>
  )
}
