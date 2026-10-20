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
  ['LocationView', LocationView, '/location/CrestonMS', [LIZ, MANAGER]],
  ['RecognitionProgram', RecognitionProgram, '/recognition', [LIZ, MANAGER]],
  ['Training', Training, '/training', [LIZ, MANAGER]],
  ['ProgramSettings', ProgramSettings, '/settings', [LIZ, MANAGER], {
    admin: ['Star milestones', 'ACE Coach milestones'],
  }],
  ['AccessAdmin', AccessAdmin, '/access', [LIZ, MANAGER]],
  ['LedgerView', LedgerView, '/ledger', [LIZ, MANAGER]],
  ['CustomReport', CustomReport, '/reports/custom', [LIZ]],
  ['MasterReport', MasterReport, '/reports/master', [LIZ]],
  ['DailyReport', DailyReport, '/reports/daily', [LIZ]],
  ['CalendarView', CalendarView, '/calendar', [LIZ]],
  ['StaffAdmin', StaffAdmin, '/staff', [LIZ]],
]

export function render() {
  const results = []
  for (const [name, Page, path, roles, expect = {}] of PAGES) {
    for (const access of roles) {
      const who = access.role === 'admin' ? 'admin' : 'manager'
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
