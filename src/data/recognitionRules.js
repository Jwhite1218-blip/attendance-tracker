export function localDateKey(dateValue = new Date()) {
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
  if (Number.isNaN(date.valueOf())) throw new Error('A valid date is required.')
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function monthlyDrawingStatus(monthKey, dateValue = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey || ''))) {
    return { isOpen: false, state: 'invalid', opensOn: null, closesOn: null }
  }

  const [year, month] = monthKey.split('-').map(Number)
  if (month < 1 || month > 12) {
    return { isOpen: false, state: 'invalid', opensOn: null, closesOn: null }
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const opensOn = `${monthKey}-${String(lastDay - 6).padStart(2, '0')}`
  const closesOn = `${monthKey}-${String(lastDay).padStart(2, '0')}`
  const today = localDateKey(dateValue)

  if (today > closesOn) return { isOpen: true, state: 'closed-month', opensOn, closesOn }
  if (today >= opensOn && today <= closesOn) return { isOpen: true, state: 'final-week', opensOn, closesOn }
  if (today < `${monthKey}-01`) return { isOpen: false, state: 'future', opensOn, closesOn }
  return { isOpen: false, state: 'waiting', opensOn, closesOn }
}

// Building managers give the daily star, nominations and shout-outs for their
// own team. Warren Food Services Employee of the Month stays district-only:
// canManageRecognitionAwards is administrator-only in auth.mjs, so a school
// session is refused it here and again on the server.
export function recognitionTypeAllowedForRole(role, type, canManageRecognitionAwards = role === 'admin') {
  if (role !== 'admin' && role !== 'school') return false
  // An ACE Coach Buck is awarded by the district, never by a building. Liz
  // and the admin team hand them to Worker Leads, Managers and the Director;
  // a school login must not be able to award one even to its own staff.
  if (type === 'ace-buck') return role === 'admin'
  return type !== 'warren-employee-month' || canManageRecognitionAwards === true
}

// ACE Coach Bucks go to kitchen managers only. Awarding one to a cook would
// put a record in the Leadership Track for somebody who is not in it;
// awarding one to the district office would hand the programme's own
// administrators its currency.
export function aceBuckRecipientAllowed(employee, managerGradePositions, districtOfficeLocation = 'Admin') {
  const position = String(employee?.position || '').trim()
  if (!(managerGradePositions || []).includes(position)) return false
  return String(employee?.location || '').trim() !== districtOfficeLocation
}

export function quarterWindowFor(dateValue = new Date()) {
  const dateKey = localDateKey(dateValue)
  const year = Number(dateKey.slice(0, 4))
  const month = Number(dateKey.slice(5, 7))
  const startMonth = Math.floor((month - 1) / 3) * 3 + 1
  const endMonth = startMonth + 2
  const endDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate()
  return {
    start: `${year}-${String(startMonth).padStart(2, '0')}-01`,
    end: `${year}-${String(endMonth).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`,
    label: `${new Date(Date.UTC(year, startMonth - 1, 1)).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}–${new Date(Date.UTC(year, endMonth - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`,
  }
}

// Who a given recognition type may be given to, from the lists a page holds.
//
// Extracted from the form so the rule can be tested without rendering
// anything: it decides whether a manager at another building appears in the
// picker at all, and getting it wrong looks like a save that worked and did
// nothing, because the server drops what the rule should have excluded.
//
//   ace-buck        manager-grade only, any building (district award)
//   star-shout-out  this building, plus every other building's managers
//   everything else this building only
export function recognitionRecipients(type, {
  scoped = [],
  peerManagers = [],
  isManager = () => false,
  isAceEligible = null,
} = {}) {
  if (type === 'ace-buck') {
    // Kitchen managers only — the district office is manager-grade but does
    // not collect the currency it awards. Falls back to manager-grade when
    // no eligibility test is supplied, so a caller that does not know about
    // the distinction still cannot offer a cook.
    const eligible = isAceEligible || isManager
    return [...scoped.filter(eligible), ...peerManagers.filter(eligible)]
  }
  if (type === 'star-shout-out') return [...scoped, ...peerManagers]
  return [...scoped]
}
