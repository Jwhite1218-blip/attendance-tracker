// The manager's way between the dashboard and the three trackers.
//
// Liz, 2026-11-11: the large buttons at the bottom of the dashboard should
// be tabs at the top, and the same strip should be on each of those pages
// so a manager can move between them and get back. District pages do not
// get this strip — an administrator already has the main navigation.
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from './PinGate.jsx'
import { useLanguage } from './LanguageProvider.jsx'

export default function ManagerTabs() {
  const { role, locationId, canEditRecognition } = useAuth()
  const { t } = useLanguage()
  const { pathname } = useLocation()
  if (role !== 'school') return null

  const tabs = [
    {
      id: 'dashboard',
      to: '/',
      label: t('nav.dashboard'),
      icon: '⌂',
      active: pathname === '/',
    },
    {
      id: 'attendance',
      to: `/location/${encodeURIComponent(locationId || '')}`,
      label: t('nav.attendance'),
      icon: '🗓',
      active: pathname.startsWith('/location/'),
    },
    ...(canEditRecognition ? [{
      id: 'allStars',
      to: '/recognition',
      label: t('nav.allStars'),
      icon: '★',
      active: pathname.startsWith('/recognition'),
    }] : []),
    {
      id: 'cards',
      to: '/ledger',
      label: t('nav.employeeRecords'),
      icon: '👤',
      active: pathname === '/ledger',
    },
  ]

  return (
    <nav aria-label={t('managerTabs.label')} className="print:hidden">
      <div className="flex flex-wrap gap-1 rounded-xl border border-[#e8c65c]/40 bg-[#1c1812] p-1">
        {tabs.map(tab => (
          <Link
            key={tab.id}
            to={tab.to}
            aria-current={tab.active ? 'page' : undefined}
            className={`inline-flex flex-none items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold sm:px-3.5 sm:text-sm ${
              tab.active
                ? 'bg-[#e8c65c] text-[#241703]'
                : 'text-amber-50 hover:bg-[#e8c65c]/15'
            }`}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span className="whitespace-nowrap">{tab.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
