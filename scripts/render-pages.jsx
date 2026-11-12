// Renders every signed-in page under Node, as each role that can reach it.
//
// This exists because `vite build` passing is not evidence a page renders.
// esbuild happily emits a reference to an identifier that was never
// imported; the browser then throws a ReferenceError on first render and the
// page is blank. That has shipped here twice — a missing component import on
// 2026-09-28, and a missing function import on 2026-10-19 that would have
// thrown the moment anyone opened the All-Stars page.
//
// A regex scanner was tried for this and could not tell code from prose.
// Actually executing the component is the only check that cannot be fooled.
//
// Build:  npx vite build --ssr scripts/render-pages.jsx --outDir dist/ssr
// Run:    node scripts/render-pages.mjs
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../src/components/PinGate.jsx'
import LanguageProvider from '../src/components/LanguageProvider.jsx'

import { AppShell } from '../src/App.jsx'
import Reports from '../src/pages/Reports.jsx'
import Dashboard from '../src/pages/Dashboard.jsx'
import ManagerHome from '../src/pages/ManagerHome.jsx'
import LocationView from '../src/pages/LocationView.jsx'
import RecognitionProgram from '../src/pages/RecognitionProgram.jsx'
import Training from '../src/pages/Training.jsx'
import ProgramSettings from '../src/pages/ProgramSettings.jsx'
import AccessAdmin from '../src/pages/AccessAdmin.jsx'
import ChangeRequests from '../src/pages/ChangeRequests.jsx'
import SpanishReview from '../src/pages/SpanishReview.jsx'
import LedgerView from '../src/pages/LedgerView.jsx'
import CustomReport from '../src/pages/CustomReport.jsx'
import RecognitionReport from '../src/pages/RecognitionReport.jsx'
import MasterReport from '../src/pages/MasterReport.jsx'
import DailyReport from '../src/pages/DailyReport.jsx'
import CalendarView from '../src/pages/CalendarView.jsx'
import StaffAdmin from '../src/pages/StaffAdmin.jsx'

const LIZ = {
  role: 'admin',
  displayName: 'Elizabeth Schmitt',
  canEditAttendance: true,
  canEditRecognition: true,
  canManageRecognitionAwards: true,
  canManageRoster: true,
  canManageBlackouts: true,
  canWriteEmployeeNotes: true,
  dataVersion: 1,
}

// An administrator who is not Liz. Since 2026-10-19 this tier proposes
// roster changes rather than making them, which is a whole code path with
// its own buttons and confirmations — worth rendering, not just reasoning
// about.
//
// canManageRoster is false, which is what the real district logins carry:
// it is why they could not edit a card and why the request path exists at
// all. The first version of this double had it true, so every check passed
// while the live screens showed those administrators nothing.
const LIMITED_ADMIN = {
  role: 'admin',
  displayName: 'District Assistant',
  canEditAttendance: true,
  canEditRecognition: true,
  canManageRoster: false,
  canManageBlackouts: false,
  canWriteEmployeeNotes: true,
  dataVersion: 1,
}

// Liz, 2026-10-26: the whole district's recognition, none of its
// attendance, training or blackout dates.
const RECOGNITION_WIDE = {
  role: 'admin',
  displayName: 'District Recognition',
  canViewAttendance: false,
  canViewTraining: false,
  canViewBlackouts: false,
  canEditAttendance: false,
  canEditRecognition: true,
  canManageRecognitionAwards: true,
  canManageRoster: false,
  canManageBlackouts: false,
  canWriteEmployeeNotes: false,
  dataVersion: 1,
}

// An administrator who keeps attendance and loses the reports hub. The
// capability is new on 2026-10-26, and the thing worth proving is that the
// bar stops offering Reports rather than offering a door that redirects.
const NO_REPORTS_ADMIN = {
  role: 'admin',
  displayName: 'No Reports',
  canViewReports: false,
  canEditAttendance: true,
  canEditRecognition: true,
  canManageRoster: false,
  canManageBlackouts: false,
  canWriteEmployeeNotes: true,
  dataVersion: 1,
}

const MANAGER = {
  role: 'school',
  locationId: 'CrestonMS',
  displayName: 'Creston Manager',
  canEditAttendance: true,
  canEditRecognition: true,
  canManageRoster: false,
  canManageBlackouts: false,
  dataVersion: 1,
}

const PAGES = [
  // Six nav entries and no more, per Liz on 2026-10-26. The expectations
  // name what each tier must be offered; the count assertion is what stops
  // the bar quietly growing back past the width it fits in.
  ['AppShell', AppShell, '/', [LIZ, LIMITED_ADMIN, RECOGNITION_WIDE, MANAGER, NO_REPORTS_ADMIN], {
    admin: ['Dashboard', 'Attendance', 'All-Stars', 'Training', 'Reports', 'Settings'],
    recognition: ['All-Stars'],
    noReports: ['Dashboard', 'Attendance', 'All-Stars'],
  }, {
    // Moved behind Settings or the Reports hub on 2026-10-26. If one of
    // these reappears in the bar, it has grown back.
    admin: ['Blackout Calendar', 'Change requests', 'Backup & Recovery',
            'Custom Report', 'Master Report', 'Employee Cards', '>Access<'],
    // Delimited, because "Attendance" also appears in the masthead —
    // "Food Service Attendance" — which is branding, not a way in.
    recognition: ['>Attendance<', '>Training<', 'Blackout Calendar'],
    noReports: ['>Reports<'],
  }],
  ['Reports', Reports, '/reports', [LIZ, RECOGNITION_WIDE], {
    admin: ['Daily report', 'Custom report', 'Master report', 'All-Star recognition report'],
    // No attendance, so only the reports that are not about attendance.
    recognition: ['Custom report', 'All-Star recognition report'],
  }],
  ['Dashboard', Dashboard, '/', [LIZ]],
  ['ManagerHome', ManagerHome, '/', [MANAGER]],
  // Liz, 2026-10-26: the building tracker opens the way the Attendance tab
  // does, and the school overview that duplicated the dashboard is gone.
  // Both are assertable even with no roster under Node, because the picker
  // and the code reference render regardless of who is on the list.
  ['LocationView', LocationView, '/location/CrestonMS', [LIZ, LIMITED_ADMIN, MANAGER], {
    admin: ['Choose an employee', 'Attendance Code Reference'],
    limited: ['Choose an employee', 'Attendance Code Reference'],
    manager: ['Choose an employee', 'Attendance Code Reference'],
  }, {
    // The school overview lives on the dashboard now, not here.
    admin: ['School Overview'],
    limited: ['School Overview'],
    manager: ['School Overview'],
  }, '/location/:id'],
  // Jon, 2026-11-11: no leaderboards. The district sees every building's
  // team, a building sees its own, and Coach Bucks show progress rather
  // than standings. If a ranking reappears, one of these comes back.
  ['RecognitionProgram', RecognitionProgram, '/recognition', [LIZ, MANAGER], {
    admin: ['The feed', '>Teams<', 'Coach progress'],
    manager: ['The feed', 'Your team'],
  }, {
    admin: ['Leaderboard', 'Who is giving stars', 'ACE Coach standings', 'Back to the top 10'],
    manager: ['Leaderboard', 'Who is giving stars', 'Coach progress'],
  }],
  ['Training', Training, '/training', [LIZ, MANAGER]],
  ['ProgramSettings', ProgramSettings, '/settings', [LIZ, MANAGER], {
    admin: ['Star milestones', 'ACE Coach milestones'],
  }],
  ['AccessAdmin', AccessAdmin, '/access', [LIZ, MANAGER]],
  ['SpanishReview', SpanishReview, '/settings/spanish-review', [LIZ, MANAGER], {
    admin: ['Spanish wording', 'Should say instead', 'Questions for the reviewer'],
  }],
  ['ChangeRequests', ChangeRequests, '/requests', [LIZ, LIMITED_ADMIN, MANAGER], {
    admin: ['Change requests', 'Nothing is waiting for review'],
    // A limited administrator proposes but does not review, so this page
    // must turn them away rather than showing the queue.
    limited: ['Only a district administrator reviews change requests'],
  }],
  // The page is named for what it holds — cards, not personnel records —
  // and the word "record" must not creep back into its headings.
  ['LedgerView', LedgerView, '/ledger', [LIZ, MANAGER], {
    admin: ['Employee Cards'],
    manager: ['Employee Cards'],
  }, {
    admin: ['Employee Records', 'Open employee record'],
    manager: ['Employee Records'],
  }],
  ['CustomReport', CustomReport, '/reports/custom', [LIZ]],
  ['RecognitionReport', RecognitionReport, '/reports/recognition', [LIZ], {
    admin: ['All-Star Recognition Report', 'Buildings', 'Award types', 'Month'],
  }],
  ['MasterReport', MasterReport, '/reports/master', [LIZ]],
  ['DailyReport', DailyReport, '/reports/daily', [LIZ]],
  ['CalendarView', CalendarView, '/calendar', [LIZ]],
  ['StaffAdmin', StaffAdmin, '/staff', [LIZ, LIMITED_ADMIN], {
    limited: ['Add employee'],
  }],
]

export function render() {
  const results = []
  // A seventh field: the route pattern, for a page that reads useParams.
  //
  // Until 2026-10-26 every page was rendered bare inside the router, so a
  // page keyed on an address parameter saw none — LocationView took its
  // "Location not found" branch in all three of its checks and nothing on
  // the real screen was ever rendered here at all.
  for (const [name, Page, path, roles, expect = {}, forbid = {}, routePath] of PAGES) {
    for (const access of roles) {
      const who = access === LIMITED_ADMIN ? 'limited'
    : access === RECOGNITION_WIDE ? 'recognition'
    : access === NO_REPORTS_ADMIN ? 'noReports'
    : access.role === 'admin' ? 'admin' : 'manager'
      try {
        const html = renderToStaticMarkup(
          <MemoryRouter initialEntries={[path]}>
            <AuthContext.Provider value={access}>
              <LanguageProvider>
                {routePath
                  ? <Routes><Route path={routePath} element={<Page />} /></Routes>
                  : <Page />}
              </LanguageProvider>
            </AuthContext.Provider>
          </MemoryRouter>
        )
        const missing = (expect[who] || []).filter(text => !html.includes(text))
        // Some requirements are about what is NOT offered — a nav condensed
        // to six entries is only condensed if the other five are gone.
        const leaked = (forbid[who] || []).filter(text => html.includes(text))
        if (missing.length || leaked.length) {
          const parts = []
          if (missing.length) parts.push(`rendered without: ${missing.join(', ')}`)
          if (leaked.length) parts.push(`should not offer: ${leaked.join(', ')}`)
          results.push({ name, who, ok: false, error: parts.join('; ') })
        } else {
          results.push({ name, who, ok: true, length: html.length })
        }
      } catch (error) {
        results.push({ name, who, ok: false, error: String(error?.message || error) })
      }
    }
  }
  return results
}
