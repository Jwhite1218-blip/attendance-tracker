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
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../src/components/PinGate.jsx'
import LanguageProvider from '../src/components/LanguageProvider.jsx'

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
  ['Dashboard', Dashboard, '/', [LIZ]],
  ['ManagerHome', ManagerHome, '/', [MANAGER]],
  // No expectation here: without a roster under Node this page renders
  // almost nothing for anybody, so it can only show that it does not throw.
  // The gate it uses is tested directly in approvalRequests.test.js.
  ['LocationView', LocationView, '/location/CrestonMS', [LIZ, LIMITED_ADMIN, MANAGER]],
  ['RecognitionProgram', RecognitionProgram, '/recognition', [LIZ, MANAGER]],
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
  ['LedgerView', LedgerView, '/ledger', [LIZ, MANAGER]],
  ['CustomReport', CustomReport, '/reports/custom', [LIZ]],
  ['MasterReport', MasterReport, '/reports/master', [LIZ]],
  ['DailyReport', DailyReport, '/reports/daily', [LIZ]],
  ['CalendarView', CalendarView, '/calendar', [LIZ]],
  ['StaffAdmin', StaffAdmin, '/staff', [LIZ, LIMITED_ADMIN], {
    limited: ['Add employee'],
  }],
]

export function render() {
  const results = []
  for (const [name, Page, path, roles, expect = {}] of PAGES) {
    for (const access of roles) {
      const who = access === LIMITED_ADMIN ? 'limited' : access.role === 'admin' ? 'admin' : 'manager'
      try {
        const html = renderToStaticMarkup(
          <MemoryRouter initialEntries={[path]}>
            <AuthContext.Provider value={access}>
              <LanguageProvider><Page /></LanguageProvider>
            </AuthContext.Provider>
          </MemoryRouter>
        )
        const missing = (expect[who] || []).filter(text => !html.includes(text))
        if (missing.length) {
          results.push({ name, who, ok: false, error: `rendered without: ${missing.join(', ')}` })
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
