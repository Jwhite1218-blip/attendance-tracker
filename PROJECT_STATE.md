# Attendance Tracker — Project State

Last verified: 2026-10-11

## Current stage
Production / live pilot. The recognition work was demonstrated to Liz's team on
2026-09-29; her follow-up notes of 2026-10-10 are built and live apart from the
approval workflow.

## Canonical source
- Repository: `Jwhite1218-blip/attendance-tracker`
- Canonical branch: `main`
- Production site: `allstartracker`
- Production URL: `https://allstartracker.netlify.app`
- Verified production commit: `d2672de189e262fc09e9cb3ee1c8b46c979876e9`
- Test suite: 218 passing (`npm test`)

## Environment roles
- Production: `allstartracker` — Supabase-backed live data and the enabled end-of-day report.
- Deploy previews: test-only. `ATTENDANCE_STATE_BACKEND=blobs`, report sending disabled, and `VITE_TEST_ENVIRONMENT_LABEL=Preview — test data`. Confirmed applied at build time on 2026-09-28.
- Dedicated stress lab: `allstartracker-stress-20260821` — use only for isolated destructive/stress testing; do not treat it as the newest product version.
- Archived legacy site: `archive-attendance-stress-old` — team-only; do not build or deploy to it.

## The production database
Supabase, in the **District 9** organisation — shown in the dashboard as
*jwhite1218@icloud.com's Project*. **The Supabase MCP connector cannot see it**:
it lists a different organisation entirely (MDB, Localis). Migrations must be
run by Jon in that project's SQL editor, never through the connector.

A migration appearing to succeed proves nothing about which database it hit.
`create or replace function` compiles plpgsql lazily, so
`mutate_legacy_state_entry` creates cleanly in an empty project. Confirm with:

```sql
select state_key, updated_at from public.legacy_state_entries
order by updated_at desc limit 10;
```

## Current milestone
Keep the live attendance workflow stable while making every review/test change
traceable and isolated from production data.

## Current rules
- Start all normal feature work from current `main`.
- Production changes must be committed before deployment.
- A deploy preview must never use production Supabase credentials or send attendance reports.
- Do not create another permanent Netlify test site for convenience.
- `vite build` passing is not evidence a page renders. esbuild emits references
  to undefined identifiers without complaint — a missing import shipped to
  production on 2026-09-28 with a green build and 192 passing tests. Scan for
  JSX components that are neither imported nor declared before shipping.
- A new shared state key must be added in three places — `src/data/sharedStore.js`,
  `netlify/functions/_shared/permissions.mjs`, and the SQL allowlist in a
  migration — and the migration must be applied *before* the feature ships, or
  writes are rejected and the form appears to save while doing nothing.
  `state-key-parity.test.mjs` enforces the first two against the third.

## Shipped 2026-09-27 / 28

**Recognition.** The printed Star of the Day card now matches Liz's paper
version, using the Aramark mark and gold star extracted from her own artwork.
Her All-Stars banner replaces the hand-built hero and is a live surface: the
star's hollow carries the month's count and the board beneath fills with
whoever was recognised. Leaderboard condensed to a top ten, consolidated into
one tabbed panel in the side column, with ties at the cut all kept. Shout-Outs
and Shooting Stars now read differently from the daily star. Cards print as a
six-up sheet or singly from an employee's record. Recognitions open to show who
gave them and what they wrote. Recording a star previews the card first. Stars
by building, by month, expandable to who earned them.

**Manager split.** The eighteen manager-grade staff — fifteen Worker Leads, two
Managers, the Director — have their own leaderboard in blue and are out of
their building's monthly drawing, which now says so rather than silently
dropping them. Membership is read from the roster's `position`, so no live
record was rewritten. `drawManagerAllStar` and `getManagerDrawingEntries` exist
and are tested but are not wired to any screen.

**Language.** EN/ES toggle on the sign-in screen and in the header, remembered
per device. Warren's own vocabulary — sixty terms across attendance codes, HR
occurrence stages and recognition wording — is drafted in Spanish and shown in
place, with a notice saying it is under review. Setting `APPROVAL` in
`src/data/programVocabulary.js` removes the notice; a test fails if the notice
is removed while approval is unset.

**Safety.** `RouteErrorBoundary` wraps the routed content so one failing page
cannot empty the whole app.

## Shipped 2026-10-10 / 11 — Liz's follow-up notes

**Beta banner.** A strip across the top of every page reading
*BETA 0.2.3 · Demo only · still in development*, hidden when printing. Version
comes from `package.json` via `__APP_VERSION__`; the build id is in the
tooltip. No wording about cost, licensing or vendor — deliberately.

**Employee card.** A phone number, stored as ten digits and formatted on
display, rendered as a `tel:` link.

**Occurrence colours.** Severity is now named in one place
(`attendanceSeverityOf`): third occurrence yellow everywhere, fourth red and
the only one that reaches the district main page, a seniority reset red
immediately. The building watch list still shows third occurrences.

**Manager landing page.** `ManagerHome` at `/` for school sessions — their
school, three counts, a button per tracker, all building-scoped. The district
`Dashboard` stays administrator-only. The roster keeps its own nav entry.

**Transfer.** Reported as "gone"; it only ever lived on the building roster, so
the button is now on the employee record too. Its destination list no longer
filters on a staff count, which had made the first transfer into an empty
kitchen impossible.

**Assignment history.** A transfer writes `employee-assignment-history-v1`
alongside the location override, with the acting administrator's name. The
employee record shows the schools worked as a timeline. Transfers before
2026-10-11 were never logged and the page says so. Administrator-only; the
server does not send the key to school sessions.

**Stars by school.** Needed no storage — recognition records already carry the
building, so someone who has moved shows what they earned at each stop.

**Professional Standards training.** New admin-only `/training` page. One
record per event carrying the employees it covered; hours in quarter-hour
increments, restarting each July; report grouped by school against the
requirement. All three tiers are set: 12 hours for the Director, 10 for Food Service
Managers and Worker Leads, 6 for Cooks and Food Service Workers (Liz,
2026-10-11). The admin team tracks its training separately and is deliberately
not in this roster. An unlisted job title still reports as "no requirement
set" rather than defaulting to a tier.

**Defects found and fixed while verifying.** A bare `YYYY-MM-DD` passed to the
shared `formatDate` parsed as UTC midnight and rendered as the previous day in
Eastern time; the manager dashboard would have shown yesterday's date all day.

## Open, waiting on Liz
1. **ACE Bucks / Leadership Track.** No ACE Buck record type exists — manager
   "stars" are ordinary `star-of-day` records shown on a blue board labelled
   ACE Coach, which reads as ACE Bucks while counting something else. Blocking:
   who awards one (her 2026-08-26 transcript says she and Marrese do, which
   contradicts the peer-award model Jon described on 2026-09-28), any cap, is
   there a manager drawing, does it print a card, and whether employee
   milestone names change from Bronze/Silver/Gold to Rookie All-Star/Rising
   Star/MVP/Hall of Fame/All-Star Legend.
2. **Approval workflow.** "Other admin logins can request to edit/transfer with
   my approval?" — still a question in her own notes, so unspecified.
   `pending-approvals-v1` is already admitted by the SQL allowlist, so building
   it needs no further migration.
3. **Spanish sign-off** on the sixty drafted terms.
4. Whether "other" belongs on the printed card, and whether the card should be
   bilingual.
5. Whether a manager's stars should still count in their building's "Stars by
   month" total while being off that building's leaderboard and out of its
   drawing.

## Open, waiting on Jon
1. **Deploy previews are publicly reachable and accept real district PINs**
   (`ATTENDANCE_ACCESS_CODES_JSON` is scoped to all contexts). A password under
   Visitor access, scoped to previews only, closes it. PIN work is deferred by
   decision. Note that two additive PIN mechanisms already exist and need no
   rebuild of the whole set: `ATTENDANCE_CHEF_PIN` and
   `ATTENDANCE_RECOGNITION_PILOT_PINS_JSON`, both conflict-protected. Neither
   can create a building-scoped PIN.
2. **`feature/offline-working-mode`** is unmerged and stale. Re-apply it over
   main's `canWriteManagedKeyForAccess` rather than the reverse, or live school
   recognition access is silently reverted — the commit message explains.
3. **The Supabase connector points at the wrong account** (see above). Worth
   reconnecting so migrations can be verified rather than hand-run.
4. Whether building managers should be able to log their own training (safety
   briefs and huddles are building-level events). Currently administrator-only,
   which matches the entry form Liz described.
