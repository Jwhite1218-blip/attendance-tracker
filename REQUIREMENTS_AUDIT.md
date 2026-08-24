# Liz Requirements Audit

Audit date: 2026-08-24

This is a traceability review of the written requirements currently available
in the repository and its GitHub pull-request history. It is not final client
acceptance until the PLAUD transcripts are reviewed and the two authenticated
production smoke tests in `FIRST_WEEK_RUNBOOK.md` are completed.

## Sources reviewed

- The original `attendance-tracker-docstar.gz` planning package.
- GitHub pull requests 2 through 10, especially the items explicitly described
  as Liz's terminology, union-rule, calendar, dashboard, and workflow requests.
- The current application, Netlify Functions, Supabase migrations, automated
  tests, production build, Netlify configuration, and public production checks.

The original Docstar package is an early generic concept. Its demo school names,
Present/Absent/Late/Excused/Remote codes, Express API proposal, and email/JWT
authentication were superseded by Liz's later Warren-specific requirements.

## Verified requirements

| Requirement | Current implementation and evidence |
| --- | --- |
| Warren roster and locations | 146 employees, 15 schools plus District Admin; unique personnel IDs and complete location assignments are tested. |
| Liz's official exception codes | RTO, RTO.5, NCNS, LI, EO, UNEX, M, BER, and JUR are the only current marking choices; legacy codes are display/migration-only. |
| Exception-only attendance | Unmarked workdays remain unrecorded; managers enter an exception and optional comment. |
| Attendance comments | One comment-capable picker is used by the active weekly and employee-calendar workflows. |
| July-June accountability | The third qualifying occurrence starts formal tracking; the fourth requires a verbal warning; prior school-year stages expire. Direct automated tests cover the thresholds and year boundary. |
| Union seniority reset | Two consecutive UNEX weekdays, including Friday-to-Monday, trigger the reset. Direct automated coverage was added. |
| Tuesday-Monday week | The school attendance week starts Tuesday and renders seven days through Monday. |
| Weekends and blackout dates | Weekends are locked. Admin-created blackout dates are locked in every attendance view. |
| Blackout ranges | A single admin action creates a labeled inclusive date range, including a range crossing December-January. Invalid, reversed, and oversized ranges are tested. |
| School-year calendar | Calendar and employee history can run July-June, and the preference is shared between views. |
| School blackout visibility | School managers can open the Blackout Calendar and see district dates, but server and UI permissions prevent them from editing those dates. This was restored after finding a regression. |
| Employee cards | Liz can add, edit, transfer, inactivate, and reactivate employees without changing the locked Personnel ID or deleting attendance history. Notes are shared. |
| Employee milestones | Birthday, completed service-anniversary, and upcoming RTO drill-downs exist for Liz and each school. School-scoped birth/service fields were restored after finding a server-filtering regression. |
| Birthday import | 144 birthdays are populated; Rayeanna McIlquham and Kira Smith remain blank, matching the written import note. Birth years are not retained. |
| T-shirt workflow | Add/edit forms and custom reports support T-shirt size and summarize missing values. |
| Reports | Master and custom employee reports are district-admin only. Custom CSV export is tested. |
| School isolation | School sessions receive only their assigned roster and attendance state, redirect away from other school URLs, and cannot write another school's records. |
| Liz and restricted admins | Permission tests cover full Liz administration, limited district editing, school managers, and read-only reviewers. |
| Read-only review | Plain and Localis-watermarked review modes can navigate but cannot change attendance, roster, notes, or blackouts. |
| Shared persistence | PIN authentication and attendance state are server-side; production uses tenant-scoped Supabase storage with atomic state mutations. |
| Privacy | Payroll amount, weekly hours, department, and other unused source fields are excluded from authenticated roster responses and the public browser bundle. |
| Reliability | Concurrent writes, explicit deletions, cross-year attendance, invalid request bodies, session revocation, rate limiting, and tenant-scoped storage are covered by automated tests. |

## Open acceptance items

1. **PLAUD transcripts:** not yet present. They may contain requirements that do
   not appear in GitHub or the Docstar package.
2. **Quick Mark:** the former duplicate Quick Mark screen was intentionally
   replaced by the consolidated Employee Records and weekly school workflows.
   Confirm from PLAUD/Liz that the replacement is accepted.
3. **Separate All Star Performance Tracker:** the only saved URL pointed back to
   this attendance app. The misleading self-link is now hidden unless a distinct
   `VITE_ALL_STAR_TRACKER_URL` is supplied. Liz's approved destination is needed.
4. **Professional Standards / CEU tracker:** GitHub explicitly records this as
   blocked on Liz's specification; it is not part of the attendance application.
5. **T-shirt data:** the feature is complete, but all 146 imported T-shirt-size
   values are currently blank. A source list is required if the tracker should
   launch with those values populated.
6. **Production access map:** Netlify masks the PIN mapping by design. Liz's PIN
   and one school PIN must be verified by their owners without exposing them.
7. **Consecutive workday interpretation:** current seniority logic skips weekends.
   Confirm whether district blackout/holiday dates must also be skipped when
   deciding whether two UNEX dates are consecutive workdays.

## Current verification result

- Automated tests: 37 passed, 0 failed.
- Production build: passed.
- Public production security/readiness checks: passed before this corrective
  release; rerun on the preview and production deploy before handoff.

