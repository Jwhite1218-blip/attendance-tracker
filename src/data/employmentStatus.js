// Employment status is now a flag and nothing else.
//
// Liz, 2026-10-20: termination date, last day worked and reason came off the
// employee card and out of the database. They were the HR half of this
// application and the district keeps that record on its own forms. What is
// left is the one thing the tracker needs — whether somebody is on an active
// roster — which carries no reason and no dates.
//
// validateInactiveDetails and validateEmploymentChanges were removed with
// the fields they guarded. There is nothing left to validate: a status is
// either active or it is not.
export function isInactive(employee) {
  return employee?.active === false
}
