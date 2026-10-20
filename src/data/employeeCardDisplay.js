// Presentation only: set to true to restore IDs on employee cards and dialogs.
// Stored identifiers, attendance links, and report exports remain unchanged.
export const SHOW_EMPLOYEE_CARD_IDS = false

// How a name reads on an employee card: full first name, last initial.
//
// Liz, 2026-10-19, on behalf of HR. The card is the page somebody lands on
// with one person's whole year in front of them, and it does not need to
// carry a full legal name to do its job. Rosters, recognition and the
// printed Star of the Day card still use full names — a manager marking
// attendance has to know exactly who they are marking, and a card with half
// a name on it is not much of an award.
//
// Presentation only. Nothing stored changes, so the full name is still there
// for exports, matching and any report HR needs.
export function employeeCardName(employee) {
  const first = String(employee?.first_name || '').trim()
  const last = String(employee?.last_name || '').trim()
  const initial = last ? `${last[0].toUpperCase()}.` : ''
  return [first, initial].filter(Boolean).join(' ') || 'Unnamed employee'
}
