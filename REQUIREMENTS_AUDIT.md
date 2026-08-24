# Liz Requirements Audit

Audit date: 2026-08-24

This is a traceability review of the written requirements currently available
in the repository, its GitHub pull-request history, and the replacement PLAUD
recording supplied on August 24. It is not final client acceptance until the
remaining access interpretation and authenticated production smoke tests in
`FIRST_WEEK_RUNBOOK.md` are completed.

## Sources reviewed

- The original `attendance-tracker-docstar.gz` planning package.
- GitHub pull requests 2 through 10, especially the items explicitly described
  as Liz's terminology, union-rule, calendar, dashboard, and workflow requests.
- PLAUD recording `ccb70394de72ba41d380d3fd085b154c`, **08-20 Meeting:
  System Access Levels and Feature Development** (59 transcript segments). The
  earlier shared PLAUD link was explicitly withdrawn and was not used.
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
| Union seniority reset | Only UNEX records count. Weekends and district blackout/holiday dates are skipped when determining the next scheduled workday, and UNEX records on closed dates are ignored. Direct automated coverage includes weekends, holidays, and legacy non-UNEX codes. |
| Tuesday-Monday week | The school attendance week starts Tuesday and renders seven days through Monday. |
| Weekends and blackout dates | Weekends are locked. Admin-created blackout dates are locked in every attendance view. |
| Blackout ranges | A single admin action creates a labeled inclusive date range, including a range crossing December-January. Invalid, reversed, and oversized ranges are tested. |
| School-year calendar | Calendar and employee history can run July-June, and the preference is shared between views. |
| School blackout visibility | School managers can open the Blackout Calendar and see district dates, but server and UI permissions prevent them from editing those dates. This was restored after finding a regression. |
| Employee cards | Liz can add, edit, transfer, inactivate, and reactivate employees without changing the locked Personnel ID or deleting attendance history. Notes are shared. T-shirt sizes are Liz-only: school and limited-admin API responses redact them, and their employee-card/report controls are hidden. |
| Employee milestones | Birthday, completed service-anniversary, and upcoming RTO drill-downs exist for Liz and each school. School-scoped birth/service fields were restored after finding a server-filtering regression. |
| Birthday import | 144 birthdays are populated; Rayeanna McIlquham and Kira Smith remain blank, matching the written import note. Birth years are not retained. |
| T-shirt workflow | Add/edit forms and custom reports support T-shirt size and summarize missing values. |
| Reports | Master and custom employee reports are district-admin only. Custom CSV export is tested. |
| Alphabetized dashboard schools | The dashboard location cards are sorted alphabetically by school name, matching the PLAUD action item. |
| School isolation | School sessions receive only their assigned roster and attendance state, redirect away from other school URLs, and cannot write another school's records. |
| Liz and restricted admins | The code supports the PLAUD access tiers: building-scoped managers; restricted district users who can edit attendance but cannot access the blackout calendar, edit employee cards, or add/remove employees; Liz full administration; and read-only review. Marlene/Reese and Jayden/Jess were assigned the same restricted capabilities for now, while their future split remains undecided. |
| Future tracker access | All Star Performance Tracker and Professional Standards appear only for Liz's full-admin access, following the later clarification. They remain disabled placeholders until Liz supplies the behavior and layout described as open in PLAUD. |
| Read-only review | Plain and Localis-watermarked review modes can navigate but cannot change attendance, roster, notes, or blackouts. |
| Shared persistence | PIN authentication and attendance state are server-side; production uses tenant-scoped Supabase storage with atomic state mutations. |
| Privacy | Payroll amount, weekly hours, department, and other unused source fields are excluded from authenticated roster responses and the public browser bundle. |
| Reliability | Concurrent writes, explicit deletions, cross-year attendance, invalid request bodies, session revocation, rate limiting, and tenant-scoped storage are covered by automated tests. |

## Open acceptance items

1. **Quick Mark:** the former duplicate Quick Mark screen was intentionally
   replaced by the consolidated Employee Records and weekly school workflows.
   Confirm from PLAUD/Liz that the replacement is accepted.
2. **All Star and Professional Standards parameters:** Liz can see both buttons,
   but they remain disabled until their separate specifications or approved URLs
   are supplied.
3. **T-shirt data:** the source roster and normalized employee table contain no
   sizes. Production has one saved employee-card override with a size, leaving
   145 employees without a stored value. A roster/spreadsheet with the remaining
   values is required; the existing live override must be preserved.
4. **Production access map:** Netlify masks the PIN mapping by design. Liz's PIN,
   the restricted district PIN(s), and one school PIN must be verified by their
   owners without exposing them.

## Current verification result

- Automated tests: 44 passed, 0 failed.
- Production build: passed.
- Release `2206381` passed preview and live public security/readiness checks on
  August 24, 2026.

