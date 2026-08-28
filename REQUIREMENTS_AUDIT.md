# Liz Requirements Audit

Audit date: 2026-08-27

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
- Liz's `All-Star Recognition Program` handout supplied August 26, including
  the daily, monthly, bonus, level, manager, and annual recognition rules.
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
| Monday-Sunday week | The school attendance week starts Monday and renders seven days through Sunday. A sticky mobile date strip keeps the active week visible while scrolling. |
| Weekends and blackout dates | Weekends are locked. Admin-created blackout dates are locked in every attendance view. |
| Blackout ranges | A single admin action creates a labeled inclusive date range, including a range crossing December-January. Invalid, reversed, and oversized ranges are tested. |
| School-year calendar | Calendar and employee history can run July-June, and the preference is shared between views. |
| School blackout visibility | School managers can open the Blackout Calendar and see district dates, but server and UI permissions prevent them from editing those dates. This was restored after finding a regression. |
| Employee cards | Liz can add, edit, transfer, inactivate, and reactivate employees without changing the locked Personnel ID or deleting attendance history. Liz and editable restricted-district managers can update shared, audited HR notes without receiving employee-card editing rights. T-shirt sizes remain Liz-only: school and limited-admin API responses redact them, and their employee-card/report controls are hidden. |
| Employee milestones | Birthday, completed service-anniversary, and upcoming RTO drill-downs exist for Liz, restricted district administrators, and each school. Birth/service dates are available for milestone calculations without exposing unused payroll fields. |
| Birthday import | 144 birthdays are populated; Rayeanna McIlquham and Kira Smith remain blank, matching the written import note. Birth years are not retained. |
| T-shirt workflow | Add/edit forms and custom reports support T-shirt size and summarize missing values. |
| Production PIN roster | Jon confirmed on August 24 that the complete production PIN roster is already in use. Owner smoke tests are representative permission checks, not PIN setup or roster-completeness work. |
| Reports | Master and custom employee reports are district-admin only. Custom CSV export is tested. |
| Alphabetized dashboard schools | The dashboard location cards are sorted alphabetically by school name, matching the PLAUD action item. |
| School isolation | School sessions receive only their assigned roster and attendance state, redirect away from other school URLs, and cannot write another school's records. |
| Liz and restricted admins | The code supports the PLAUD access tiers: building-scoped managers; restricted district users who can edit attendance, update district-wide shared HR notes, and see real-time occurrence alerts but cannot access the blackout calendar, edit protected employee-card fields, or add/remove employees; Liz full administration with the same alerts; and read-only review. Marlene/Reese and Jayden/Jess have the same restricted capabilities, and Chef is intended to receive another credential at that level. |
| All-Star Recognition | The handout-driven All-Star workspace is limited to administrator-role sessions. Building/school PINs receive no recognition state, cannot write recognition, do not see the All-Stars navigation item, and are redirected away from `/recognition`. District administrators and restricted administrator profiles can work across buildings; review accounts remain read-only and cannot enter the workspace. The public NFC pages remain unauthenticated, read-only crowd views exposing only approved names and separate counts. Only Star of the Day advances the July-June leaderboard and supplies weighted monthly drawing entries. Shooting Star nominations, Warren Star Shout-Outs, monthly winners, and Employee of the Month remain separately visible without inflating that count. The workspace preserves the approved criteria, calculates all five levels, shows employee recognition history, and keeps server-owned actor attribution. ACE Bucks and annual prize selection remain informational because the source does not define point values or a selection formula. |
| Future tool access | Professional Standards remains visible only to Liz's full-admin access and stays disabled until its separate behavior or approved URL is supplied. |
| Read-only review | Plain and Localis-watermarked review modes can navigate but cannot change attendance, roster, notes, or blackouts. |
| Shared persistence | PIN authentication and attendance state are server-side; production uses tenant-scoped Supabase storage with atomic state mutations. |
| Privacy | Payroll amount, weekly hours, department, and other unused source fields are excluded from authenticated roster responses and the public browser bundle. |
| Reliability | Concurrent writes, explicit deletions, cross-year attendance, invalid request bodies, session revocation, rate limiting, and tenant-scoped storage are covered by automated tests. |

## Open acceptance items

1. **Quick Mark:** the former duplicate Quick Mark screen was intentionally
   replaced by the consolidated Employee Records and weekly school workflows.
   Confirm from PLAUD/Liz that the replacement is accepted.
2. **Remaining recognition parameters:** confirm ACE Buck denominations and
   redemption values, the annual-award decision process, and whether Warren
   wants a separate public shout-out intake form outside the PIN-protected
   manager portal. Professional Standards still needs its separate specification
   or approved URL.
3. **End-of-day email activation:** the privacy-limited weekday report engine is
   implemented and tested. Initial live delivery is routed to Jon for review
   and manual forwarding to Liz; direct delivery to Liz remains deferred.

## Deferred data entry

T-shirt sizes are intentionally being entered later after Liz supplies them.
Jon confirmed on August 24 that the one previously saved size was test data. It
was removed from production without changing the employee's other saved card
details. All 146 employee cards now resolve to a blank T-shirt size. The values
will be imported from Liz's Excel sheet when it is supplied; the blank values
are expected and are not a launch blocker.

## Owner smoke tests

Netlify masks the PIN mapping by design, but Jon confirmed that the full roster
of production PINs is already in use. Liz's PIN, one restricted-district PIN,
and one school PIN still need representative behavior checks without exposing
their values.

## Current verification result

- Automated tests: 86 passed, 0 failed, including recognition rules, monthly
  weighting, role permissions, and school isolation.
- Production build: passed.
- Production dependency audit: zero known vulnerabilities after validating the
  React Router 7.18.2 security update on the isolated testing clone.
- Production content was not modified during the release split. A fresh Liz
  backup and authenticated production smoke test remain required immediately
  before the September 2 launch.
- Recovery: Supabase Pro daily physical backups are active; point-in-time
  recovery is not enabled.
- The current live release passed its public security/readiness check, and the
  isolated candidate passed all 15 NFC leaderboard checks, on August 27, 2026.
